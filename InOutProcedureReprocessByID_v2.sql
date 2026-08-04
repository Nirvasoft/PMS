ALTER PROCEDURE [dbo].[InOutProcedureReprocessByID](
    @ESyskey  BIGINT,
    @FromDate NVARCHAR(8),
    @ToDate   NVARCHAR(8),
    @USERID   VARCHAR(50),
    @USERNAME VARCHAR(255),
    @USERSK   BIGINT,
    @REASON   NVARCHAR(255)
)
AS
BEGIN
    SET NOCOUNT ON;

    -- ================================================================
    -- PHASE 1: SETUP — Temp tables, batch number, syskey counter
    -- ================================================================

    CREATE TABLE #Punches (
        FigID    NVARCHAR(50),
        EmpSK    BIGINT,
        MacID    NVARCHAR(50),
        FDate    NVARCHAR(8),
        FTime    NVARCHAR(8),
        InOutType BIGINT,
        FileID   NVARCHAR(255)
    );
    CREATE CLUSTERED INDEX IX_Punches ON #Punches(FDate, FigID, EmpSK, FTime);

    -- Pre-computed shift schedule for the employee across the date range
    CREATE TABLE #Shifts (
        FDate       NVARCHAR(8),
        SetTimeIn   NVARCHAR(8),
        SetTimeOut  NVARCHAR(8),
        WPDate      NVARCHAR(8),
        ShiftSource INT           -- 1 = simple roster, 2 = calendar roster
    );

    DECLARE @DeviceSetup INT = ISNULL((SELECT n1 FROM ATTConfig WHERE t1 = 'DeviceStup'), 0);
    DECLARE @ATTSYSKEY   BIGINT;
    DECLARE @ATTBATCHNO  VARCHAR(50);

    -- Get next batch number (once)
    SELECT @ATTBATCHNO = ISNULL(MAX(CONVERT(INT, REPLACE(t5, CHAR(0), '')) + 1), 1)
    FROM ATT101 WITH (NOLOCK)
    WHERE RecordStatus <> 4;

    -- Get next syskey (once, then increment locally)
    SELECT @ATTSYSKEY = ISNULL(MAX(SYSKEY), 0) FROM ATT101 WITH (NOLOCK);

    -- ================================================================
    -- PHASE 2: LOAD raw punch data from ATT102
    -- ================================================================

    IF @DeviceSetup = 1
    BEGIN
        INSERT INTO #Punches(FigID, EmpSK, MacID, FDate, FTime, InOutType, FileID)
        SELECT T1, N1, T2, T3, T4, N3, T5
        FROM ATT102 WITH (NOLOCK)
        WHERE RecordStatus <> 4
          AND N5 = 0
          AND N1 = @ESyskey
          AND T3 BETWEEN @FromDate AND @ToDate
          AND T2 IN (SELECT N1 FROM DeviceSetUp WITH (NOLOCK) WHERE RecordStatus <> 4 AND N2 = 1);
    END
    ELSE
    BEGIN
        INSERT INTO #Punches(FigID, EmpSK, MacID, FDate, FTime, InOutType, FileID)
        SELECT T1, N1, T2, T3, T4, N3, T5
        FROM ATT102 WITH (NOLOCK)
        WHERE RecordStatus <> 4
          AND N5 = 0
          AND N1 = @ESyskey
          AND T3 BETWEEN @FromDate AND @ToDate;
    END

    -- Exit early if no punches to process
    IF NOT EXISTS (SELECT 1 FROM #Punches)
    BEGIN
        DROP TABLE #Punches;
        DROP TABLE #Shifts;
        RETURN;
    END

    -- ================================================================
    -- PHASE 3: SET-BASED DEDUPLICATION
    -- Remove punches already recorded in ATT101
    -- ================================================================

    DELETE p
    FROM #Punches p
    WHERE EXISTS (
        SELECT 1
        FROM ATT101 a WITH (NOLOCK)
        WHERE a.RecordStatus <> 4
          AND a.N1 = p.EmpSK
          AND (
              (a.T1 = p.FDate AND a.T2 = p.FTime)
              OR (a.T3 = p.FDate AND a.T4 = p.FTime)
          )
    );

    -- For groups with 3+ punches: remove near-duplicate max times
    -- If the 2nd-highest time was already in ATT101, and the highest time
    -- is within 100 units (~1 min), the highest is also a duplicate
    ;WITH RankedPunches AS (
        SELECT FDate, FigID, EmpSK, FTime,
               ROW_NUMBER() OVER (PARTITION BY FDate, FigID ORDER BY FTime DESC) AS rn,
               COUNT(*) OVER (PARTITION BY FDate, FigID) AS cnt
        FROM #Punches
    )
    DELETE p
    FROM #Punches p
    INNER JOIN RankedPunches rp ON rp.FDate = p.FDate AND rp.FigID = p.FigID AND rp.FTime = p.FTime AND rp.rn = 1
    WHERE rp.cnt >= 3
      AND EXISTS (
          SELECT 1 FROM RankedPunches r2
          WHERE r2.FDate = rp.FDate AND r2.FigID = rp.FigID AND r2.rn = 2
            AND ABS(CAST(rp.FTime AS INT) - CAST(r2.FTime AS INT)) < 100
            AND EXISTS (
                SELECT 1 FROM ATT101 a WITH (NOLOCK)
                WHERE a.RecordStatus <> 4 AND a.N1 = p.EmpSK
                  AND ((a.T1 = r2.FDate AND a.T2 = r2.FTime) OR (a.T3 = r2.FDate AND a.T4 = r2.FTime))
            )
      );

    -- Exit if nothing left after dedup
    IF NOT EXISTS (SELECT 1 FROM #Punches)
    BEGIN
        DROP TABLE #Punches;
        DROP TABLE #Shifts;
        RETURN;
    END

    -- ================================================================
    -- PHASE 4: PRE-COMPUTE SHIFT SCHEDULES
    -- Build a lookup of shift times for each date in the range
    -- ================================================================

    -- 4a: Simple roster shifts (EmployeeWorkPolicy.n2=0)
    INSERT INTO #Shifts(FDate, SetTimeIn, SetTimeOut, WPDate, ShiftSource)
    SELECT DISTINCT
        d.FDate,
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, sht.t3), 108), ':', ''),
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, sht.t4), 108), ':', ''),
        CONVERT(NVARCHAR(8),
            CONVERT(DATETIME, DATEADD(MINUTE, sht.n1 * 60,
                CONVERT(DATETIME, CONVERT(DATETIME, d.FDate) + sht.t3)), 108), 112),
        1
    FROM (SELECT DISTINCT FDate FROM #Punches) d
    INNER JOIN EmployeeWorkPolicy wp WITH (NOLOCK) ON d.FDate BETWEEN wp.t3 AND wp.t4
    INNER JOIN EmployeeWorkPolicyDetail wd WITH (NOLOCK) ON wd.parentid = wp.syskey AND wd.n4 = @ESyskey
    INNER JOIN roster ro WITH (NOLOCK) ON ro.t1 = wp.t1 AND ro.n1 = DATEPART(WEEKDAY, d.FDate)
    INNER JOIN att012 sht WITH (NOLOCK) ON sht.syskey = ro.n4
    WHERE wp.n2 = 0 AND wd.n2 = 0
      AND wp.RecordStatus <> 4 AND wd.RecordStatus <> 4
      AND ro.RecordStatus <> 4 AND sht.RecordStatus <> 4;

    -- 4b: Calendar roster shifts (EmployeeWorkPolicyDetail.n2=1)
    -- Only for dates not already covered by simple roster
    INSERT INTO #Shifts(FDate, SetTimeIn, SetTimeOut, WPDate, ShiftSource)
    SELECT DISTINCT
        d.FDate,
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, at.t3), 108), ':', ''),
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, at.t4), 108), ':', ''),
        CONVERT(NVARCHAR(8),
            CONVERT(DATETIME, DATEADD(MINUTE, at.n1 * 60,
                CONVERT(DATETIME, CONVERT(DATETIME, d.FDate) + at.t3)), 108), 112),
        2
    FROM (SELECT DISTINCT FDate FROM #Punches) d
    INNER JOIN EmployeeWorkPolicyDetail wd WITH (NOLOCK) ON wd.n4 = @ESyskey AND d.FDate = wd.t5
    INNER JOIN att012 at WITH (NOLOCK) ON wd.n3 = at.syskey
    WHERE wd.n2 = 1
      AND wd.RecordStatus <> 4 AND at.RecordStatus <> 4
      AND NOT EXISTS (SELECT 1 FROM #Shifts s WHERE s.FDate = d.FDate);

    CREATE INDEX IX_Shifts ON #Shifts(FDate);

    -- Also pre-compute previous-day shift info (needed for cross-midnight logic)
    CREATE TABLE #PrevDayShifts (
        FDate         NVARCHAR(8),   -- The "current" date (prev day = FDate - 1)
        PrevDate      NVARCHAR(8),
        PrevSetTimeIn NVARCHAR(8),
        PrevSetTimeOut NVARCHAR(8),
        PrevWPDate    NVARCHAR(8)
    );

    INSERT INTO #PrevDayShifts(FDate, PrevDate, PrevSetTimeIn, PrevSetTimeOut, PrevWPDate)
    SELECT DISTINCT
        d.FDate,
        CONVERT(NVARCHAR(8), DATEADD(DAY, -1, d.FDate), 112),
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, at.t3), 108), ':', ''),
        REPLACE(CONVERT(VARCHAR(8), CONVERT(TIME, at.t4), 108), ':', ''),
        CONVERT(NVARCHAR(8),
            CONVERT(DATETIME, DATEADD(MINUTE, at.n1 * 60,
                CONVERT(DATETIME, CONVERT(DATETIME, CONVERT(NVARCHAR(8), DATEADD(DAY, -1, d.FDate), 112)) + at.t3)), 108), 112)
    FROM (SELECT DISTINCT FDate FROM #Punches) d
    INNER JOIN EmployeeWorkPolicyDetail wd WITH (NOLOCK)
        ON wd.n4 = @ESyskey AND CONVERT(NVARCHAR(8), DATEADD(DAY, -1, d.FDate), 112) = wd.t5
    INNER JOIN att012 at WITH (NOLOCK) ON wd.n3 = at.syskey
    WHERE wd.n2 = 1 AND wd.RecordStatus <> 4 AND at.RecordStatus <> 4;

    CREATE INDEX IX_PrevShifts ON #PrevDayShifts(FDate);

    -- ================================================================
    -- PHASE 5: MAIN PROCESSING LOOP
    -- Iterate over each (FDate, FigID, EmpSK) group
    -- ================================================================

    -- Aggregate punch data per group to avoid repeated queries
    CREATE TABLE #PunchSummary (
        FDate    NVARCHAR(8),
        FigID    NVARCHAR(50),
        EmpSK    BIGINT,
        MinTime  NVARCHAR(8),
        MaxTime  NVARCHAR(8),
        PunchCnt INT,
        MaxFileID NVARCHAR(255)
    );

    INSERT INTO #PunchSummary(FDate, FigID, EmpSK, MinTime, MaxTime, PunchCnt, MaxFileID)
    SELECT FDate, FigID, EmpSK, MIN(FTime), MAX(FTime), COUNT(*), MAX(FileID)
    FROM #Punches
    GROUP BY FDate, FigID, EmpSK;

    CREATE INDEX IX_PunchSum ON #PunchSummary(FDate, FigID, EmpSK);

    -- Working variables
    DECLARE @FDATE       NVARCHAR(8),  @FIGID       NVARCHAR(50), @EMPSYSKEY   BIGINT;
    DECLARE @MINTIME     NVARCHAR(8),  @MAXTIME      NVARCHAR(8), @PunchCnt    INT;
    DECLARE @FILEID      NVARCHAR(255);
    DECLARE @SETTIMEIN   NVARCHAR(8),  @SETTIMEOUT   NVARCHAR(8), @WPDATE      NVARCHAR(8);
    DECLARE @PREVDATE    NVARCHAR(8),  @PREVTIMEOUT  NVARCHAR(8), @PREVTIMEIN  NVARCHAR(8);
    DECLARE @PREVSETTIMEIN  NVARCHAR(8), @PREVSETTIMEOUT NVARCHAR(8), @PREVWPDATE NVARCHAR(8);
    DECLARE @INCOUNT     INT,          @OUTCOUNT     INT;
    DECLARE @IsSameDay   BIT,          @IsDiffDay    BIT,          @NoShift     BIT;
    DECLARE @CheckTime   NVARCHAR(8),  @BalanceTime  NVARCHAR(8);
    DECLARE @EWPPrevWPDate NVARCHAR(8), @EWPPrevSetTimeIn NVARCHAR(8), @EWPPrevSetTimeOut NVARCHAR(8);

    DECLARE main_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT FDate, FigID, EmpSK, MinTime, MaxTime, PunchCnt, MaxFileID
        FROM #PunchSummary
        ORDER BY FDate, FigID;

    OPEN main_cursor;
    FETCH NEXT FROM main_cursor INTO @FDATE, @FIGID, @EMPSYSKEY, @MINTIME, @MAXTIME, @PunchCnt, @FILEID;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- --------------------------------------------------------
        -- 5a: Load shift data for this date (pre-computed)
        -- --------------------------------------------------------
        SET @SETTIMEIN = '';
        SET @SETTIMEOUT = '';
        SET @WPDATE = '';
        SET @PREVSETTIMEIN = '';
        SET @PREVSETTIMEOUT = '';
        SET @PREVWPDATE = '';
        SET @EWPPrevWPDate = '';
        SET @EWPPrevSetTimeIn = '';
        SET @EWPPrevSetTimeOut = '';
        SET @PREVDATE = CONVERT(NVARCHAR(8), DATEADD(DAY, -1, @FDATE), 112);

        SELECT TOP 1 @SETTIMEIN = SetTimeIn, @SETTIMEOUT = SetTimeOut, @WPDATE = WPDate
        FROM #Shifts WHERE FDate = @FDATE;

        SELECT TOP 1 @PREVSETTIMEIN = PrevSetTimeIn, @PREVSETTIMEOUT = PrevSetTimeOut, @PREVWPDATE = PrevWPDate
        FROM #PrevDayShifts WHERE FDate = @FDATE;

        -- If no shift found for today, check if previous day's calendar shift extends into today
        IF @SETTIMEIN = '' AND @SETTIMEOUT = ''
        BEGIN
            SELECT TOP 1
                @EWPPrevSetTimeIn = PrevSetTimeIn,
                @EWPPrevSetTimeOut = PrevSetTimeOut,
                @EWPPrevWPDate = PrevWPDate
            FROM #PrevDayShifts WHERE FDate = @FDATE;
        END

        -- Classify shift type
        SET @IsSameDay = CASE
            WHEN @SETTIMEIN <> '' AND @SETTIMEOUT <> ''
                 AND (@SETTIMEIN <= '120000' OR @SETTIMEOUT >= '120000')
                 AND @SETTIMEIN <> @SETTIMEOUT THEN 1 ELSE 0 END;

        SET @IsDiffDay = CASE
            WHEN @SETTIMEIN <> '' AND @SETTIMEOUT <> ''
                 AND ((@SETTIMEIN >= '120000' AND @SETTIMEOUT <= '120000') OR @SETTIMEOUT = @SETTIMEIN) THEN 1 ELSE 0 END;

        SET @NoShift = CASE
            WHEN @SETTIMEIN = '' AND @SETTIMEOUT = '' THEN 1 ELSE 0 END;

        -- --------------------------------------------------------
        -- 5b: Lookup existing ATT101 records for this employee + date
        -- --------------------------------------------------------
        SET @INCOUNT = 0;
        SET @OUTCOUNT = 0;
        SET @PREVTIMEOUT = '';
        SET @PREVTIMEIN = '';

        -- INCOUNT: Records where TimeIn date is today (timeout not yet set)
        SELECT @INCOUNT = COUNT(*)
        FROM ATT101 WITH (NOLOCK)
        WHERE T1 = @FDATE AND T3 = '00000000' AND N1 = @EMPSYSKEY AND RecordStatus <> 4 AND N2 <> 3;

        -- OUTCOUNT: Records where TimeOut date is today (timein not yet set)
        SELECT @OUTCOUNT = COUNT(*)
        FROM ATT101 WITH (NOLOCK)
        WHERE T3 = @FDATE AND T1 = '00000000' AND N1 = @EMPSYSKEY AND RecordStatus <> 4 AND N2 <> 3;

        -- Previous day's existing record
        SELECT TOP 1 @PREVTIMEOUT = T4, @PREVTIMEIN = T2
        FROM ATT101 WITH (NOLOCK)
        WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

        -- ============================================================
        -- 5c: SINGLE PUNCH PROCESSING
        -- ============================================================
        IF @PunchCnt = 1
        BEGIN
            IF @INCOUNT > 0
            BEGIN
                -- Existing record with time-in on this date, no time-out yet
                IF @IsSameDay = 1
                BEGIN
                    IF CAST(@MINTIME AS INT) <= 120000
                        UPDATE ATT101 SET T2 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
                ELSE IF @IsDiffDay = 1
                BEGIN
                    IF CAST(@MINTIME AS INT) > 120000
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE IF CAST(@MINTIME AS INT) <= 120000 AND @PREVTIMEOUT = '000000'
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
                ELSE IF @NoShift = 1
                BEGIN
                    DECLARE @currTimeout NVARCHAR(8) = '';
                    SELECT @currTimeout = T4 FROM ATT101 WITH (NOLOCK)
                    WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @FDATE AND N1 = @EMPSYSKEY;
                    IF @currTimeout = '000000'
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
            END
            ELSE IF @OUTCOUNT > 0
            BEGIN
                -- Existing record with time-out on this date, no time-in yet
                IF @IsSameDay = 1
                BEGIN
                    IF CAST(@MINTIME AS INT) <= 120000
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                    BEGIN
                        DECLARE @existT4_sd NVARCHAR(8) = '';
                        SELECT @existT4_sd = T4 FROM ATT101 WITH (NOLOCK)
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T3 = @FDATE AND N1 = @EMPSYSKEY;
                        IF @existT4_sd < @MINTIME
                            UPDATE ATT101 SET T1 = @FDATE, T2 = @existT4_sd, T4 = @MINTIME
                            WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                END
                ELSE IF @IsDiffDay = 1
                BEGIN
                    IF CAST(@MINTIME AS INT) >= 120000
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE IF @PREVTIMEOUT = '000000'
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
                ELSE IF @NoShift = 1
                BEGIN
                    DECLARE @existT4_ns NVARCHAR(8) = '';
                    SELECT @existT4_ns = T4 FROM ATT101 WITH (NOLOCK)
                    WHERE RecordStatus <> 4 AND N2 <> 3 AND T3 = @FDATE AND N1 = @EMPSYSKEY;
                    IF @existT4_ns < @MINTIME
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @existT4_ns, T4 = @MINTIME
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                    BEGIN
                        DECLARE @existT2_ns NVARCHAR(8) = '';
                        SELECT @existT2_ns = T2 FROM ATT101 WITH (NOLOCK)
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T3 = @FDATE AND N1 = @EMPSYSKEY;
                        IF @existT2_ns = '000000'
                            UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME
                            WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                END
            END
            ELSE
            BEGIN
                -- ====================================================
                -- NO EXISTING RECORDS — Single punch, need to INSERT
                -- ====================================================
                IF @IsSameDay = 1
                BEGIN
                    -- Check if previous day's shift continues into today
                    IF @SETTIMEIN = @PREVSETTIMEOUT AND @PREVWPDATE = @FDATE
                    BEGIN
                        IF @PREVTIMEOUT = '000000'
                        BEGIN
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                        END
                        ELSE IF CAST(@MINTIME AS INT) <= 120000
                        BEGIN
                            -- Re-check prev day timeout
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;
                            IF @PREVTIMEOUT = '000000'
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                        ELSE IF CAST(@MINTIME AS INT) >= 120000 AND CAST(@SETTIMEIN AS INT) >= 120000
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE IF CAST(@MINTIME AS INT) >= 120000
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                    ELSE IF CAST(@MINTIME AS INT) <= 120000
                    BEGIN
                        -- Check if prev day cross-midnight shift needs timeout
                        DECLARE @prevWP2 NVARCHAR(8) = '', @prevSTO2 NVARCHAR(8) = '';
                        SELECT TOP 1 @prevWP2 = PrevWPDate, @prevSTO2 = PrevSetTimeOut
                        FROM #PrevDayShifts WHERE FDate = @FDATE;

                        SET @PREVTIMEOUT = '';
                        SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                        IF @PREVTIMEOUT = '000000' AND @prevWP2 = @FDATE
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                    ELSE IF CAST(@MINTIME AS INT) >= 120000 AND CAST(@SETTIMEIN AS INT) >= 120000
                    BEGIN
                        IF CAST(@MINTIME AS INT) >= CAST(@SETTIMEOUT AS INT) AND @SETTIMEOUT <> '000000'
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                    ELSE IF CAST(@MINTIME AS INT) >= 120000
                    BEGIN
                        IF ABS(CAST(@MINTIME AS INT) - CAST(@SETTIMEIN AS INT)) < 10000
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                END
                ELSE IF @IsDiffDay = 1
                BEGIN
                    IF CAST(@MINTIME AS INT) >= 120000
                    BEGIN
                        SET @ATTSYSKEY = @ATTSYSKEY + 1;
                        INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                            T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                        VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                            @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                    END
                    ELSE
                    BEGIN
                        SET @PREVTIMEOUT = '';
                        SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                        IF @PREVTIMEOUT = '000000' AND @PREVSETTIMEOUT <> ''
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE IF (@PREVTIMEOUT IS NULL OR @PREVTIMEOUT = '') AND @FDATE = @WPDATE
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE IF @FDATE < @WPDATE
                        BEGIN
                            -- Check for orphaned in-record on prev day
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND T3 = '00000000' AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000' AND @PREVSETTIMEOUT <> ''
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND T3 = '00000000' AND RecordStatus <> 4 AND N2 <> 3;
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                    END
                END
                ELSE IF @NoShift = 1
                BEGIN
                    -- No shift assigned — use previous day context to determine action
                    SET @PREVTIMEOUT = '';
                    SELECT TOP 1 @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                    WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY
                    ORDER BY T4 DESC;

                    -- Re-fetch prev day WPDate for no-shift context
                    SET @PREVWPDATE = '';
                    SELECT TOP 1 @PREVWPDATE = PrevWPDate FROM #PrevDayShifts WHERE FDate = @FDATE;

                    IF (@PREVTIMEOUT = '000000' OR @EWPPrevWPDate = @FDATE) AND @PREVWPDATE = @FDATE
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE IF @PREVTIMEOUT = '000000'
                         AND (ABS(CAST(@EWPPrevSetTimeOut AS INT) - CAST(@MINTIME AS INT)) < 10000 OR @EWPPrevSetTimeIn = @EWPPrevSetTimeOut)
                         AND @EWPPrevWPDate = @FDATE
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3 AND T4 = '000000';
                    ELSE
                    BEGIN
                        IF CAST(@MINTIME AS INT) <= 120000
                        BEGIN
                            -- Check for orphaned out-record on previous day
                            SET @PREVTIMEOUT = '';
                            SET @PREVTIMEIN = '';
                            SELECT @PREVTIMEOUT = T4, @PREVTIMEIN = T2 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY AND T3 = '00000000';

                            IF @PREVTIMEOUT = '000000' AND CAST(@PREVSETTIMEOUT AS INT) - CAST(@MINTIME AS INT) < 10000 AND @PREVWPDATE = @FDATE
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3 AND T3 = '00000000';
                            ELSE IF @PREVWPDATE = @FDATE
                            BEGIN
                                SET @PREVTIMEOUT = '';
                                SET @PREVTIMEIN = '';
                                SELECT @PREVTIMEOUT = T4, @PREVTIMEIN = T2 FROM ATT101 WITH (NOLOCK)
                                WHERE RecordStatus <> 4 AND N2 <> 3 AND N1 = @EMPSYSKEY AND T1 = @PREVDATE;

                                IF @PREVTIMEIN = '000000' OR @PREVTIMEIN = ''
                                BEGIN
                                    SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                    INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                        T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                    VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                        '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                                END
                                ELSE
                                    UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME
                                    WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3 AND T3 = '00000000';
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                        ELSE IF CAST(@MINTIME AS INT) >= 120000
                        BEGIN
                            IF @EWPPrevWPDate IS NULL OR @EWPPrevWPDate = ''
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    '00000000','000000',@FDATE,@MINTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                    END
                END
            END -- end single punch no-existing-records
        END -- end single punch

        -- ============================================================
        -- 5d: MULTIPLE PUNCH PROCESSING (@PunchCnt > 1)
        -- ============================================================
        ELSE IF @PunchCnt > 1
        BEGIN
            -- For 3+ punches, refine MINTIME/MAXTIME by skipping close-together times
            SET @BalanceTime = '';
            IF @PunchCnt >= 3
            BEGIN
                -- Skip forward from MINTIME: advance past times within 1 hour of each other
                SELECT @CheckTime = MIN(FTime) FROM #Punches
                WHERE FDate = @FDATE AND FigID = @FIGID AND FTime > @MINTIME AND FTime < @MAXTIME;

                WHILE @CheckTime IS NOT NULL
                      AND (CAST(@CheckTime AS INT) - CAST(@MINTIME AS INT)) < 10000
                      AND ((@PREVSETTIMEOUT <> @SETTIMEIN) OR (@PREVWPDATE <> @FDATE AND @PREVSETTIMEOUT = @SETTIMEIN))
                BEGIN
                    -- Check if prev day needs this time as timeout
                    SET @PREVTIMEOUT = '';
                    SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                    WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                    IF @PREVTIMEOUT = '000000'
                       AND (@PREVWPDATE = @FDATE OR (CAST(@SETTIMEIN AS INT) >= 120000 AND CAST(@CheckTime AS INT) < 120000))
                       AND @CheckTime > @MINTIME
                        SET @MINTIME = @CheckTime;

                    SELECT @CheckTime = MIN(FTime) FROM #Punches
                    WHERE FDate = @FDATE AND FigID = @FIGID AND FTime > @MINTIME AND FTime < @MAXTIME AND FTime > @CheckTime;
                END

                -- If continuous shift from prev day, use latest possible time before MAX
                IF @PREVSETTIMEOUT = @SETTIMEIN
                    SELECT @CheckTime = MAX(FTime) FROM #Punches
                    WHERE FDate = @FDATE AND FigID = @FIGID AND FTime < @MAXTIME;

                -- Skip backward from MAXTIME: retreat past times within 1 hour
                WHILE @CheckTime IS NOT NULL AND (CAST(@MAXTIME AS INT) - CAST(@CheckTime AS INT)) < 10000
                BEGIN
                    IF CAST(@SETTIMEIN AS INT) > 120000 AND CAST(@MAXTIME AS INT) > 120000
                       AND CAST(@CheckTime AS INT) > 120000 AND @CheckTime < @MAXTIME
                        SET @MAXTIME = @CheckTime;
                    ELSE
                        SELECT @CheckTime = MIN(FTime) FROM #Punches
                        WHERE FDate = @FDATE AND FigID = @FIGID AND FTime > @MINTIME AND FTime < @MAXTIME AND FTime > @CheckTime;
                END

                SET @BalanceTime = @CheckTime;
            END

            DECLARE @TimeDiff INT = ABS(CAST(@MAXTIME AS INT) - CAST(@MINTIME AS INT));

            -- --------------------------------------------------------
            -- Multi-punch with existing IN record
            -- --------------------------------------------------------
            IF @INCOUNT > 0
            BEGIN
                IF @IsSameDay = 1
                BEGIN
                    IF @TimeDiff > 10000
                    BEGIN
                        DECLARE @existIn NVARCHAR(8) = '';
                        SELECT @existIn = T2 FROM ATT101 WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @FDATE AND N1 = @EMPSYSKEY;
                        IF @existIn IS NOT NULL AND @existIn <= @MINTIME
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE
                            UPDATE ATT101 SET T2 = @MINTIME, T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                    ELSE -- Double press (both times very close)
                    BEGIN
                        IF CAST(@MAXTIME AS INT) <= 120000
                            UPDATE ATT101 SET T2 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE IF CAST(@MINTIME AS INT) >= 120000
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                END
                ELSE IF @IsDiffDay = 1
                BEGIN
                    IF @TimeDiff > 10000 AND CAST(@MAXTIME AS INT) >= 120000
                    BEGIN
                        UPDATE ATT101 SET T2 = @MAXTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;

                        SET @PREVTIMEOUT = '';
                        SELECT @PREVTIMEOUT = T4 FROM ATT101
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;
                        IF @PREVTIMEOUT = '000000'
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                    ELSE -- Double press
                    BEGIN
                        IF CAST(@MINTIME AS INT) >= 120000
                            UPDATE ATT101 SET T2 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE IF CAST(@MAXTIME AS INT) <= 120000
                        BEGIN
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000'
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    '00000000','000000',@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                    END
                END
                ELSE IF @NoShift = 1
                BEGIN
                    IF @TimeDiff > 10000
                        UPDATE ATT101 SET T2 = @MINTIME, T3 = @FDATE, T4 = @MAXTIME
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                        UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME
                        WHERE N1 = @EMPSYSKEY AND T1 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
            END
            -- --------------------------------------------------------
            -- Multi-punch with existing OUT record
            -- --------------------------------------------------------
            ELSE IF @OUTCOUNT > 0
            BEGIN
                IF @IsSameDay = 1
                BEGIN
                    IF @TimeDiff > 10000
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                    BEGIN
                        IF CAST(@MAXTIME AS INT) <= 120000
                            UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                        ELSE IF CAST(@MINTIME AS INT) >= 120000
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    END
                END
                ELSE IF @NoShift = 1
                BEGIN
                    IF @TimeDiff > 10000
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME, T3 = @FDATE, T4 = @MAXTIME
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                    ELSE
                        UPDATE ATT101 SET T1 = @FDATE, T2 = @MINTIME
                        WHERE N1 = @EMPSYSKEY AND T3 = @FDATE AND RecordStatus <> 4 AND N2 <> 3;
                END
            END
            -- --------------------------------------------------------
            -- Multi-punch with NO existing records — INSERT
            -- --------------------------------------------------------
            ELSE
            BEGIN
                IF @IsSameDay = 1
                BEGIN
                    IF @TimeDiff > 10000
                    BEGIN
                        IF @BalanceTime IS NOT NULL AND @BalanceTime <> ''
                           AND (CAST(@MAXTIME AS INT) - CAST(@BalanceTime AS INT)) > 10000
                        BEGIN
                            -- Continuous time: prev day timeout + new record for today
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000'
                            BEGIN
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;

                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@BalanceTime,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                        ELSE IF (CAST(@SETTIMEIN AS INT) >= 120000 AND CAST(@MINTIME AS INT) >= 120000)
                              OR (CAST(@SETTIMEIN AS INT) >= 120000 AND ABS(CAST(@SETTIMEIN AS INT) - CAST(@MINTIME AS INT)) <= 10000)
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE IF CAST(@SETTIMEIN AS INT) >= 120000 AND CAST(@MINTIME AS INT) < 120000
                              AND ABS(CAST(@SETTIMEIN AS INT) - CAST(@MINTIME AS INT)) > 10000
                        BEGIN
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000' AND @PREVSETTIMEIN <> ''
                               AND CAST(@MAXTIME AS INT) > 120000 AND @PREVWPDATE = @FDATE
                            BEGIN
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;

                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@MAXTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                        ELSE IF CAST(@SETTIMEIN AS INT) >= 120000 AND CAST(@MINTIME AS INT) < 120000
                              AND ABS(CAST(@SETTIMEIN AS INT) - CAST(@MINTIME AS INT)) > 10000
                        BEGIN
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000'
                            BEGIN
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;

                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@MAXTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,0,
                                    @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                        ELSE
                        BEGIN
                            -- Default: insert with MIN as time-in, MAX as time-out
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                    ELSE -- Double-press (times too close), treat as single punch
                    BEGIN
                        SET @ATTSYSKEY = @ATTSYSKEY + 1;
                        INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                            T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                        VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                            @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                    END
                END
                ELSE IF @IsDiffDay = 1
                BEGIN
                    -- Different-day shift with multiple punches, no existing record
                    IF @TimeDiff > 10000
                    BEGIN
                        IF CAST(@MINTIME AS INT) >= 120000
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE
                        BEGIN
                            -- MIN before noon, MAX after noon — split across prev day
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;

                            IF @PREVTIMEOUT = '000000' AND @PREVSETTIMEOUT <> ''
                            BEGIN
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;

                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MAXTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                    END
                    ELSE -- Double press
                    BEGIN
                        IF CAST(@MINTIME AS INT) >= 120000
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,1,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE
                        BEGIN
                            SET @PREVTIMEOUT = '';
                            SELECT @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                            WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY;
                            IF @PREVTIMEOUT = '000000'
                                UPDATE ATT101 SET T3 = @FDATE, T4 = @MAXTIME, N3 = 1
                                WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;
                            ELSE
                            BEGIN
                                SET @ATTSYSKEY = @ATTSYSKEY + 1;
                                INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                    T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                                VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                    '00000000','000000',@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                            END
                        END
                    END
                END
                ELSE IF @NoShift = 1
                BEGIN
                    -- No shift assigned — use MIN/MAX as time-in/time-out
                    IF @TimeDiff > 10000
                    BEGIN
                        -- Check prev day for cross-midnight
                        SET @PREVTIMEOUT = '';
                        SELECT TOP 1 @PREVTIMEOUT = T4 FROM ATT101 WITH (NOLOCK)
                        WHERE RecordStatus <> 4 AND N2 <> 3 AND T1 = @PREVDATE AND N1 = @EMPSYSKEY ORDER BY T4 DESC;

                        SET @PREVWPDATE = '';
                        SELECT TOP 1 @PREVWPDATE = PrevWPDate FROM #PrevDayShifts WHERE FDate = @FDATE;

                        IF @PREVTIMEOUT = '000000' AND @PREVWPDATE = @FDATE
                        BEGIN
                            UPDATE ATT101 SET T3 = @FDATE, T4 = @MINTIME, N3 = 1
                            WHERE N1 = @EMPSYSKEY AND T1 = @PREVDATE AND RecordStatus <> 4 AND N2 <> 3;

                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MAXTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                        ELSE
                        BEGIN
                            SET @ATTSYSKEY = @ATTSYSKEY + 1;
                            INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                                T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                            VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                                @FDATE,@MINTIME,@FDATE,@MAXTIME,@ATTBATCHNO,'','','',@EMPSYSKEY,0,1,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                        END
                    END
                    ELSE
                    BEGIN
                        -- Double-press, treat as single time-in
                        SET @ATTSYSKEY = @ATTSYSKEY + 1;
                        INSERT INTO ATT101(syskey,createddate,modifieddate,userid,username,RecordStatus,SyncStatus,SyncBatch,usersyskey,
                            T1,T2,T3,T4,T5,T6,t7,t8,N1,N2,N3,N4,N5,N6,N7,N8,N9,N10,N11,batchno,otbatchno,FILEID,reason)
                        VALUES(@ATTSYSKEY,CONVERT(NVARCHAR(8),GETDATE(),112),CONVERT(NVARCHAR(8),GETDATE(),112),@USERID,@USERNAME,1,0,0,@USERSK,
                            @FDATE,@MINTIME,'00000000','000000',@ATTBATCHNO,'','','',@EMPSYSKEY,0,0,0,0,0,0,0,0,0,0,0,0,@FILEID,@REASON);
                    END
                END
            END -- end multi-punch no-existing
        END -- end multi-punch

        FETCH NEXT FROM main_cursor INTO @FDATE, @FIGID, @EMPSYSKEY, @MINTIME, @MAXTIME, @PunchCnt, @FILEID;
    END -- end cursor loop

    CLOSE main_cursor;
    DEALLOCATE main_cursor;

    -- ================================================================
    -- PHASE 6: CLEANUP
    -- ================================================================
    DROP TABLE #PunchSummary;
    DROP TABLE #PrevDayShifts;
    DROP TABLE #Shifts;
    DROP TABLE #Punches;
END
GO
