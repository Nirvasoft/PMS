# Module 5.5 — Flutter Mobile Applications

**Phase:** 5 — Tenant Experience & Mobile Applications  
**Stack:** Flutter 3.x · Dart · Riverpod · Dio · Firebase (FCM + Crashlytics) · flutter_secure_storage  
**Apps:** Resident App · Technician App · Security App · Manager App  
**Estimated Effort:** 6 weeks (2 per app, done in pairs: Resident+Manager, Technician+Security)  
**Depends On:** All Phase 1–5 backend APIs

---

## Table of Contents
1. [Flutter Project Architecture](#flutter-project-architecture)
2. [Shared Foundation Layer](#shared-foundation-layer)
3. [App 1 — Resident App](#app-1--resident-app)
4. [App 2 — Technician App](#app-2--technician-app)
5. [App 3 — Security App](#app-3--security-app)
6. [App 4 — Manager App](#app-4--manager-app)
7. [Flutter State Management (Riverpod)](#flutter-state-management-riverpod)
8. [Offline Support & Sync](#offline-support--sync)
9. [Push Notifications (FCM)](#push-notifications-fcm)
10. [Build & Release Configuration](#build--release-configuration)

---

## Flutter Project Architecture

### Monorepo Structure

```
pms_mobile/
├── packages/
│   ├── pms_core/                       # Shared foundation package
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   │   ├── api_client.dart     # Dio + interceptors
│   │   │   │   ├── api_endpoints.dart  # all endpoint constants
│   │   │   │   └── interceptors/
│   │   │   │       ├── auth_interceptor.dart
│   │   │   │       ├── retry_interceptor.dart
│   │   │   │       └── logging_interceptor.dart
│   │   │   ├── auth/
│   │   │   │   ├── auth_service.dart
│   │   │   │   ├── token_storage.dart  # flutter_secure_storage
│   │   │   │   └── auth_provider.dart  # Riverpod
│   │   │   ├── models/                 # Dart data classes (freezed)
│   │   │   │   ├── user.dart
│   │   │   │   ├── property.dart
│   │   │   │   ├── unit.dart
│   │   │   │   ├── lease.dart
│   │   │   │   ├── invoice.dart
│   │   │   │   ├── maintenance_ticket.dart
│   │   │   │   ├── work_order.dart
│   │   │   │   ├── visitor.dart
│   │   │   │   ├── booking.dart
│   │   │   │   ├── announcement.dart
│   │   │   │   └── notification_model.dart
│   │   │   ├── services/
│   │   │   │   ├── notification_service.dart   # FCM setup
│   │   │   │   ├── storage_service.dart        # SharedPreferences + Hive
│   │   │   │   ├── connectivity_service.dart
│   │   │   │   └── location_service.dart       # GPS for patrol/delivery
│   │   │   ├── theme/
│   │   │   │   ├── app_theme.dart
│   │   │   │   ├── app_colors.dart
│   │   │   │   └── app_typography.dart
│   │   │   └── widgets/
│   │   │       ├── common/
│   │   │       │   ├── pms_app_bar.dart
│   │   │       │   ├── pms_button.dart
│   │   │       │   ├── pms_card.dart
│   │   │       │   ├── pms_badge.dart
│   │   │       │   ├── pms_empty_state.dart
│   │   │       │   ├── pms_error_widget.dart
│   │   │       │   ├── pms_loading_widget.dart
│   │   │       │   ├── status_chip.dart
│   │   │       │   ├── priority_badge.dart
│   │   │       │   └── photo_capture_widget.dart
│   │   │       └── form/
│   │   │           ├── pms_text_field.dart
│   │   │           ├── pms_dropdown.dart
│   │   │           └── pms_date_picker.dart
│   │   └── pubspec.yaml
│   │
│   └── pms_ui/                         # Shared UI components package
│       └── lib/
│           ├── charts/
│           │   ├── kpi_card.dart
│           │   ├── bar_chart_widget.dart
│           │   └── gauge_widget.dart
│           └── maps/
│               └── property_map_widget.dart
│
├── apps/
│   ├── resident_app/
│   ├── technician_app/
│   ├── security_app/
│   └── manager_app/
│
└── melos.yaml                          # Monorepo management
```

### Core Dependencies (`pms_core/pubspec.yaml`)

```yaml
name: pms_core
environment:
  sdk: ">=3.0.0 <4.0.0"
  flutter: ">=3.16.0"

dependencies:
  flutter:
    sdk: flutter

  # State management
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.4

  # Networking
  dio: ^5.4.0
  retrofit: ^4.1.0
  pretty_dio_logger: ^1.3.1

  # Data models
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1

  # Local storage
  flutter_secure_storage: ^9.0.0    # JWT tokens
  hive_flutter: ^1.1.0              # Offline data cache
  shared_preferences: ^2.2.2

  # Firebase
  firebase_core: ^2.27.0
  firebase_messaging: ^14.7.20      # Push notifications
  firebase_crashlytics: ^3.4.20     # Crash reporting
  firebase_analytics: ^10.8.10

  # Navigation
  go_router: ^13.2.0

  # Camera & files
  camera: ^0.10.5
  image_picker: ^1.0.7
  file_picker: ^6.1.1
  dio_smart_retry: ^6.0.0

  # UI utilities
  cached_network_image: ^3.3.1
  shimmer: ^3.0.0
  intl: ^0.19.0
  url_launcher: ^6.2.5
  permission_handler: ^11.3.0
  connectivity_plus: ^6.0.2
  geolocator: ^11.0.0

  # QR
  qr_flutter: ^4.1.0
  mobile_scanner: ^4.0.0            # QR scanning

  # Charts
  fl_chart: ^0.67.0

  # Stripe payments
  flutter_stripe: ^10.1.1

  # Signature
  syncfusion_flutter_signaturepad: ^24.1.41

dev_dependencies:
  freezed: ^2.4.7
  json_serializable: ^6.7.1
  retrofit_generator: ^8.1.0
  riverpod_generator: ^2.3.9
  build_runner: ^2.4.8
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
```

---

## Shared Foundation Layer

### API Client (`pms_core/lib/api/api_client.dart`)

```dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ApiClient {
  late final Dio _dio;
  final FlutterSecureStorage _storage;
  final String baseUrl;

  ApiClient({required this.baseUrl, required FlutterSecureStorage storage})
      : _storage = storage {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.addAll([
      AuthInterceptor(_dio, _storage),
      RetryInterceptor(_dio, retries: 3),
      PrettyDioLogger(requestBody: true, responseBody: true),
    ]);
  }

  Dio get dio => _dio;
}

// Auth interceptor — attaches token + handles 401 refresh
class AuthInterceptor extends QueuedInterceptor {
  final Dio _dio;
  final FlutterSecureStorage _storage;

  AuthInterceptor(this._dio, this._storage);

  @override
  Future<void> onRequest(
      RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
      DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      try {
        final newToken = await _refreshToken();
        final opts = err.requestOptions;
        opts.headers['Authorization'] = 'Bearer $newToken';
        final response = await _dio.fetch(opts);
        handler.resolve(response);
      } catch (_) {
        // Refresh failed → logout
        await _storage.deleteAll();
        handler.reject(err);
      }
    } else {
      handler.next(err);
    }
  }

  Future<String> _refreshToken() async {
    final refreshToken = await _storage.read(key: 'refresh_token');
    final response = await Dio().post(
      '${_dio.options.baseUrl}/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    final data = response.data['data'];
    await _storage.write(key: 'access_token', value: data['accessToken']);
    await _storage.write(key: 'refresh_token', value: data['refreshToken']);
    return data['accessToken'];
  }
}
```

### Auth Service

```dart
// pms_core/lib/auth/auth_service.dart
@riverpod
class AuthNotifier extends _$AuthNotifier {
  @override
  AsyncValue<AuthUser?> build() => const AsyncData(null);

  Future<void> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final response = await ref.read(apiClientProvider).dio.post(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      final data = response.data['data'];

      if (data['mfaRequired'] == true) {
        state = AsyncData(AuthUser(mfaPending: true, mfaToken: data['mfaToken']));
        return;
      }

      await _saveTokens(data['accessToken'], data['refreshToken']);
      final user = AuthUser.fromJson(data['user']);
      state = AsyncData(user);
    } on DioException catch (e) {
      state = AsyncError(_mapDioError(e), StackTrace.current);
    }
  }

  Future<void> logout() async {
    await ref.read(storageProvider).deleteAll();
    state = const AsyncData(null);
  }

  Future<void> _saveTokens(String access, String refresh) async {
    final storage = ref.read(storageProvider);
    await storage.write(key: 'access_token', value: access);
    await storage.write(key: 'refresh_token', value: refresh);
  }
}
```

### Models (Freezed)

```dart
// pms_core/lib/models/maintenance_ticket.dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'maintenance_ticket.freezed.dart';
part 'maintenance_ticket.g.dart';

@freezed
class MaintenanceTicket with _$MaintenanceTicket {
  const factory MaintenanceTicket({
    required String id,
    required String ticketNumber,
    required String title,
    String? description,
    required String categoryId,
    required String categoryName,
    required String priority,
    required String status,
    String? unitId,
    String? unitNumber,
    String? propertyId,
    String? propertyName,
    String? assignedToId,
    String? assignedToName,
    DateTime? slaResponseDueAt,
    DateTime? slaResolveDueAt,
    bool? slaResponseMet,
    bool? slaResolveMet,
    int? rating,
    String? ratingComment,
    @Default([]) List<TicketPhoto> photos,
    @Default([]) List<WorkOrder> workOrders,
    required DateTime createdAt,
  }) = _MaintenanceTicket;

  factory MaintenanceTicket.fromJson(Map<String, dynamic> json) =>
      _$MaintenanceTicketFromJson(json);
}

@freezed
class WorkOrder with _$WorkOrder {
  const factory WorkOrder({
    required String id,
    required String woNumber,
    required String title,
    required String assignedToId,
    required String status,
    DateTime? scheduledStart,
    DateTime? actualStart,
    DateTime? actualEnd,
    double? estimatedHours,
    double? actualHours,
    double? totalCost,
    String? completionNotes,
    @Default([]) List<ChecklistItem> checklist,
    @Default([]) List<WorkOrderMaterial> materials,
    required DateTime createdAt,
  }) = _WorkOrder;

  factory WorkOrder.fromJson(Map<String, dynamic> json) =>
      _$WorkOrderFromJson(json);
}
```

---

## App 1 — Resident App

**Bundle ID:** `com.pms.resident`  
**Target Users:** Tenants and residents living in managed properties  
**Platform:** iOS + Android

### App Directory Structure

```
apps/resident_app/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── router.dart                    # go_router setup
│   ├── features/
│   │   ├── auth/
│   │   │   ├── login_screen.dart
│   │   │   ├── mfa_screen.dart
│   │   │   └── auth_provider.dart
│   │   ├── dashboard/
│   │   │   ├── dashboard_screen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── balance_card.dart
│   │   │   │   ├── lease_card.dart
│   │   │   │   ├── open_tickets_widget.dart
│   │   │   │   ├── upcoming_bookings_widget.dart
│   │   │   │   └── announcement_banner.dart
│   │   │   └── dashboard_provider.dart
│   │   ├── invoices/
│   │   │   ├── invoice_list_screen.dart
│   │   │   ├── invoice_detail_screen.dart
│   │   │   ├── payment_screen.dart    # Stripe integration
│   │   │   ├── payment_history_screen.dart
│   │   │   └── invoice_provider.dart
│   │   ├── maintenance/
│   │   │   ├── maintenance_list_screen.dart
│   │   │   ├── maintenance_detail_screen.dart
│   │   │   ├── submit_request_screen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── category_grid.dart
│   │   │   │   ├── ticket_status_card.dart
│   │   │   │   ├── rating_dialog.dart
│   │   │   │   └── photo_evidence_row.dart
│   │   │   └── maintenance_provider.dart
│   │   ├── visitors/
│   │   │   ├── visitor_list_screen.dart
│   │   │   ├── register_visitor_screen.dart
│   │   │   ├── visitor_pass_screen.dart  # QR code display
│   │   │   ├── walkin_approval_dialog.dart
│   │   │   └── visitor_provider.dart
│   │   ├── bookings/
│   │   │   ├── facility_list_screen.dart
│   │   │   ├── facility_detail_screen.dart
│   │   │   ├── availability_screen.dart
│   │   │   ├── booking_form_screen.dart
│   │   │   ├── my_bookings_screen.dart
│   │   │   └── booking_provider.dart
│   │   ├── community/
│   │   │   ├── feed_screen.dart
│   │   │   ├── announcement_detail_screen.dart
│   │   │   ├── poll_card.dart
│   │   │   ├── complaints_screen.dart
│   │   │   └── community_provider.dart
│   │   ├── lease/
│   │   │   ├── lease_detail_screen.dart
│   │   │   └── lease_documents_screen.dart
│   │   ├── residents/
│   │   │   ├── resident_list_screen.dart
│   │   │   └── add_resident_screen.dart
│   │   └── profile/
│   │       ├── profile_screen.dart
│   │       ├── kyc_screen.dart
│   │       ├── notification_prefs_screen.dart
│   │       └── change_password_screen.dart
│   └── pubspec.yaml
```

### Router

```dart
// apps/resident_app/lib/router.dart
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authNotifierProvider);

  return GoRouter(
    initialLocation: '/dashboard',
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null && !authState.valueOrNull!.mfaPending;
      final isMfaPending = authState.valueOrNull?.mfaPending ?? false;
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/mfa');

      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isMfaPending && !state.matchedLocation.startsWith('/mfa')) return '/mfa';
      if (isLoggedIn && isAuthRoute) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/mfa', builder: (_, __) => const MfaScreen()),
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
          GoRoute(
            path: '/invoices',
            builder: (_, __) => const InvoiceListScreen(),
            routes: [
              GoRoute(path: ':id', builder: (_, s) => InvoiceDetailScreen(id: s.pathParameters['id']!)),
              GoRoute(path: ':id/pay', builder: (_, s) => PaymentScreen(invoiceId: s.pathParameters['id']!)),
            ],
          ),
          GoRoute(
            path: '/maintenance',
            builder: (_, __) => const MaintenanceListScreen(),
            routes: [
              GoRoute(path: 'submit', builder: (_, __) => const SubmitRequestScreen()),
              GoRoute(path: ':id', builder: (_, s) => MaintenanceDetailScreen(id: s.pathParameters['id']!)),
            ],
          ),
          GoRoute(path: '/visitors', builder: (_, __) => const VisitorListScreen(),
            routes: [
              GoRoute(path: 'register', builder: (_, __) => const RegisterVisitorScreen()),
              GoRoute(path: ':id/pass', builder: (_, s) => VisitorPassScreen(id: s.pathParameters['id']!)),
            ],
          ),
          GoRoute(path: '/bookings', builder: (_, __) => const FacilityListScreen()),
          GoRoute(path: '/community', builder: (_, __) => const FeedScreen()),
          GoRoute(path: '/lease', builder: (_, __) => const LeaseDetailScreen()),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
        ],
      ),
    ],
  );
});
```

### Key Screen Implementations

```dart
// apps/resident_app/lib/features/dashboard/dashboard_screen.dart
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dashboardProvider.future),
        child: dashboardAsync.when(
          loading: () => const DashboardSkeleton(),
          error: (e, s) => PmsErrorWidget(error: e, onRetry: () => ref.invalidate(dashboardProvider)),
          data: (data) => CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 160,
                flexibleSpace: FlexibleSpaceBar(
                  background: PropertyHeroImage(url: data.property.coverImageUrl),
                ),
                title: Text('${data.property.name} · Unit ${data.unit.unitNumber}'),
                actions: [
                  NotificationBell(unreadCount: data.unreadNotifications),
                ],
              ),
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(delegate: SliverChildListDelegate([
                  BalanceCard(
                    outstanding: data.invoiceSummary.outstanding,
                    currency: data.lease.currency,
                    nextDueDate: data.invoiceSummary.nextDueDate,
                    onPayNow: () => context.push('/invoices'),
                  ),
                  const SizedBox(height: 12),
                  LeaseCard(lease: data.lease),
                  const SizedBox(height: 12),
                  if (data.openTickets.isNotEmpty)
                    OpenTicketsWidget(tickets: data.openTickets,
                      onViewAll: () => context.push('/maintenance')),
                  const SizedBox(height: 12),
                  if (data.upcomingBookings.isNotEmpty)
                    UpcomingBookingsWidget(bookings: data.upcomingBookings),
                  const SizedBox(height: 12),
                  if (data.recentAnnouncements.isNotEmpty)
                    AnnouncementBanner(announcement: data.recentAnnouncements.first,
                      onTap: () => context.push('/community')),
                  const SizedBox(height: 16),
                  QuickActionsGrid(actions: data.quickActions),
                ])),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const ResidentBottomNav(),
    );
  }
}

// apps/resident_app/lib/features/maintenance/submit_request_screen.dart
class SubmitRequestScreen extends ConsumerStatefulWidget {
  const SubmitRequestScreen({super.key});

  @override
  ConsumerState<SubmitRequestScreen> createState() => _SubmitRequestScreenState();
}

class _SubmitRequestScreenState extends ConsumerState<SubmitRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _selectedCategoryId;
  String _priority = 'P3';
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _locationController = TextEditingController();
  final List<XFile> _photos = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PmsAppBar(title: 'Report an Issue'),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            CategoryGrid(
              onSelected: (id) => setState(() => _selectedCategoryId = id),
              selectedId: _selectedCategoryId,
            ),
            const SizedBox(height: 16),
            PmsTextField(
              controller: _titleController,
              label: 'Brief title',
              hint: 'e.g. Water leaking from bathroom ceiling',
              validator: (v) => v!.isEmpty ? 'Title is required' : null,
            ),
            const SizedBox(height: 12),
            PmsTextField(
              controller: _descController,
              label: 'Description (optional)',
              hint: 'Any additional details...',
              maxLines: 4,
            ),
            const SizedBox(height: 12),
            PmsTextField(
              controller: _locationController,
              label: 'Location in unit',
              hint: 'e.g. Master bathroom, Kitchen',
            ),
            const SizedBox(height: 12),
            PrioritySelector(
              selected: _priority,
              onChanged: (p) => setState(() => _priority = p),
            ),
            const SizedBox(height: 16),
            PhotoCaptureWidget(
              photos: _photos,
              onAdd: _pickPhoto,
              onRemove: (i) => setState(() => _photos.removeAt(i)),
              maxPhotos: 5,
            ),
            const SizedBox(height: 24),
            PmsButton(
              label: 'Submit Request',
              onPressed: _submit,
              isFullWidth: true,
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (_) => PhotoSourceSheet(),
    );
    if (source == null) return;
    final image = await picker.pickImage(source: source, imageQuality: 70);
    if (image != null) setState(() => _photos.add(image));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _selectedCategoryId == null) return;

    final notifier = ref.read(maintenanceNotifierProvider.notifier);
    await notifier.submitRequest(
      categoryId: _selectedCategoryId!,
      title: _titleController.text,
      description: _descController.text,
      locationDetail: _locationController.text,
      priority: _priority,
      photos: _photos,
    );

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Request submitted! We\'ll get back to you soon.')),
      );
      context.pop();
    }
  }
}

// Payment screen with Stripe
// apps/resident_app/lib/features/invoices/payment_screen.dart
class PaymentScreen extends ConsumerWidget {
  final String invoiceId;
  const PaymentScreen({super.key, required this.invoiceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoiceAsync = ref.watch(invoiceDetailProvider(invoiceId));

    return Scaffold(
      appBar: PmsAppBar(title: 'Pay Invoice'),
      body: invoiceAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => PmsErrorWidget(error: e),
        data: (invoice) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            InvoiceSummaryCard(invoice: invoice),
            const Spacer(),
            PmsButton(
              label: 'Pay ${invoice.currency} ${invoice.outstandingAmount.toStringAsFixed(2)}',
              onPressed: () => _initiatePayment(context, ref, invoice),
              isFullWidth: true,
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _initiatePayment(BuildContext context, WidgetRef ref, invoice) async {
    final result = await ref.read(paymentProvider.notifier).initiateStripePayment(invoiceId);
    // Open Stripe Checkout in WebView / in-app browser
    await launchUrl(Uri.parse(result.checkoutUrl), mode: LaunchMode.inAppBrowserView);
  }
}
```

### Bottom Navigation

```dart
// apps/resident_app/lib/widgets/resident_bottom_nav.dart
class ResidentBottomNav extends ConsumerWidget {
  const ResidentBottomNav({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;

    return NavigationBar(
      selectedIndex: _indexFromLocation(location),
      onDestinationSelected: (i) => _navigate(context, i),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.receipt_outlined), selectedIcon: Icon(Icons.receipt), label: 'Invoices'),
        NavigationDestination(icon: Icon(Icons.build_outlined), selectedIcon: Icon(Icons.build), label: 'Maintenance'),
        NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Visitors'),
        NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'More'),
      ],
    );
  }
}
```

---

## App 2 — Technician App

**Bundle ID:** `com.pms.technician`  
**Target Users:** Maintenance technicians — daily work order management  
**Platform:** Android (primary), iOS (secondary)

### Directory Structure

```
apps/technician_app/
├── lib/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   │   ├── technician_dashboard.dart     # today's WOs summary
│   │   │   └── dashboard_provider.dart
│   │   ├── work_orders/
│   │   │   ├── wo_list_screen.dart           # active + scheduled WOs
│   │   │   ├── wo_detail_screen.dart         # full WO detail
│   │   │   ├── wo_start_screen.dart          # confirm start + GPS capture
│   │   │   ├── wo_complete_screen.dart       # checklist + materials + photos
│   │   │   ├── wo_on_hold_screen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── wo_status_card.dart
│   │   │   │   ├── checklist_editor.dart
│   │   │   │   ├── materials_entry.dart
│   │   │   │   ├── before_after_photos.dart
│   │   │   │   └── sla_countdown_banner.dart
│   │   │   └── wo_provider.dart
│   │   ├── pm_work_orders/
│   │   │   ├── pm_wo_list_screen.dart
│   │   │   ├── pm_wo_detail_screen.dart
│   │   │   ├── pm_wo_complete_screen.dart    # checklist with findings
│   │   │   └── pm_provider.dart
│   │   ├── schedule/
│   │   │   ├── schedule_screen.dart          # weekly calendar view
│   │   │   └── schedule_provider.dart
│   │   └── profile/
│   │       ├── profile_screen.dart
│   │       └── skills_screen.dart
```

### Key Screens

```dart
// apps/technician_app/lib/features/work_orders/wo_list_screen.dart
class WoListScreen extends ConsumerWidget {
  const WoListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final woAsync = ref.watch(myWorkOrdersProvider);

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: PmsAppBar(
          title: 'My Work Orders',
          bottom: const TabBar(tabs: [
            Tab(text: 'Active'),
            Tab(text: 'Scheduled'),
            Tab(text: 'Completed'),
          ]),
        ),
        body: woAsync.when(
          loading: () => const PmsLoadingWidget(),
          error: (e, _) => PmsErrorWidget(error: e),
          data: (wos) => TabBarView(children: [
            WoListView(wos: wos.where((w) => ['accepted','in_progress','on_hold'].contains(w.status)).toList()),
            WoListView(wos: wos.where((w) => w.status == 'pending').toList()),
            WoListView(wos: wos.where((w) => w.status == 'completed').toList(), isCompleted: true),
          ]),
        ),
      ),
    );
  }
}

// apps/technician_app/lib/features/work_orders/wo_complete_screen.dart
class WoCompleteScreen extends ConsumerStatefulWidget {
  final String woId;
  const WoCompleteScreen({super.key, required this.woId});

  @override
  ConsumerState<WoCompleteScreen> createState() => _WoCompleteScreenState();
}

class _WoCompleteScreenState extends ConsumerState<WoCompleteScreen> {
  final _completionNotesController = TextEditingController();
  final List<ChecklistItemResult> _checklistResults = [];
  final List<MaterialEntry> _materials = [];
  final List<XFile> _afterPhotos = [];
  double _actualHours = 0;

  @override
  Widget build(BuildContext context) {
    final woAsync = ref.watch(workOrderDetailProvider(widget.woId));

    return Scaffold(
      appBar: PmsAppBar(title: 'Complete Work Order'),
      body: woAsync.when(
        loading: () => const PmsLoadingWidget(),
        error: (e, _) => PmsErrorWidget(error: e),
        data: (wo) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            WoSummaryHeader(wo: wo),
            const SizedBox(height: 16),
            // Actual hours
            HoursInput(
              value: _actualHours,
              onChanged: (h) => setState(() => _actualHours = h),
            ),
            const Divider(height: 32),
            // Checklist
            Text('Checklist', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...wo.checklist.asMap().entries.map((e) =>
              ChecklistItemTile(
                item: e.value,
                onChanged: (result) => _updateChecklist(e.key, result),
              )),
            const Divider(height: 32),
            // Materials used
            Text('Materials Used', style: Theme.of(context).textTheme.titleMedium),
            MaterialsEntryWidget(
              materials: _materials,
              onAdd: () => _showAddMaterialDialog(),
              onRemove: (i) => setState(() => _materials.removeAt(i)),
            ),
            const Divider(height: 32),
            // After photos
            Text('After Photos', style: Theme.of(context).textTheme.titleMedium),
            PhotoCaptureWidget(
              photos: _afterPhotos,
              onAdd: _capturePhoto,
              onRemove: (i) => setState(() => _afterPhotos.removeAt(i)),
              minPhotos: 1,
              hint: 'At least 1 completion photo required',
            ),
            const SizedBox(height: 12),
            PmsTextField(
              controller: _completionNotesController,
              label: 'Completion Notes',
              hint: 'Describe what was done...',
              maxLines: 4,
            ),
            const SizedBox(height: 24),
            PmsButton(
              label: 'Mark as Complete',
              onPressed: _afterPhotos.isEmpty ? null : _complete,
              isFullWidth: true,
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _complete() async {
    final notifier = ref.read(woNotifierProvider.notifier);
    await notifier.completeWorkOrder(
      woId: widget.woId,
      completionNotes: _completionNotesController.text,
      actualHours: _actualHours,
      checklistResults: _checklistResults,
      materialsUsed: _materials,
      afterPhotos: _afterPhotos,
    );
    if (mounted) context.pop();
  }
}
```

---

## App 3 — Security App

**Bundle ID:** `com.pms.security`  
**Target Users:** Security guards and officers  
**Platform:** Android (primary)

### Directory Structure

```
apps/security_app/
├── lib/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   │   └── security_dashboard.dart   # live: checked-in visitors + recent incidents
│   │   ├── visitor_gate/
│   │   │   ├── gate_screen.dart           # main scanning interface
│   │   │   ├── qr_scanner_screen.dart     # mobile_scanner full-screen
│   │   │   ├── scan_result_screen.dart    # green/red result + visitor details
│   │   │   ├── walkin_screen.dart         # manual walk-in entry
│   │   │   ├── active_visitors_screen.dart
│   │   │   └── gate_provider.dart
│   │   ├── incidents/
│   │   │   ├── incident_list_screen.dart
│   │   │   ├── create_incident_screen.dart
│   │   │   ├── incident_detail_screen.dart
│   │   │   └── incident_provider.dart
│   │   ├── patrol/
│   │   │   ├── patrol_screen.dart          # checkpoint scan interface
│   │   │   ├── patrol_log_screen.dart
│   │   │   └── patrol_provider.dart
│   │   └── profile/
```

### Key Screens

```dart
// apps/security_app/lib/features/visitor_gate/qr_scanner_screen.dart
class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({super.key});

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen> {
  bool _isProcessing = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        MobileScanner(
          onDetect: _onDetect,
          controller: MobileScannerController(
            detectionSpeed: DetectionSpeed.normal,
            facing: CameraFacing.back,
          ),
        ),
        // Scanning overlay
        CustomPaint(
          painter: ScannerOverlayPainter(),
          child: const SizedBox.expand(),
        ),
        Positioned(
          top: MediaQuery.of(context).padding.top + 16,
          left: 16,
          child: IconButton(
            icon: const Icon(Icons.close, color: Colors.white, size: 32),
            onPressed: () => context.pop(),
          ),
        ),
        Positioned(
          bottom: 60,
          left: 0, right: 0,
          child: Column(children: [
            if (_isProcessing)
              const CircularProgressIndicator(color: Colors.white),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              icon: const Icon(Icons.person_add),
              label: const Text('Walk-in Entry'),
              onPressed: () => context.push('/walk-in'),
            ),
          ]),
        ),
      ]),
    );
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode?.rawValue == null) return;

    setState(() => _isProcessing = true);
    HapticFeedback.mediumImpact();

    final result = await ref.read(gateProvider.notifier)
        .scanVisitor(token: barcode!.rawValue!, gateId: 'GATE-MAIN');

    setState(() => _isProcessing = false);

    if (mounted) {
      await context.push('/gate/result', extra: result);
    }
  }
}

// apps/security_app/lib/features/visitor_gate/scan_result_screen.dart
class ScanResultScreen extends StatelessWidget {
  final VisitorScanResult result;
  const ScanResultScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final isAuthorized = result.authorized;
    return Scaffold(
      backgroundColor: isAuthorized ? AppColors.success : AppColors.error,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isAuthorized ? Icons.check_circle : Icons.cancel,
                size: 120,
                color: Colors.white,
              ),
              const SizedBox(height: 24),
              Text(
                isAuthorized
                    ? (result.action == 'check_in' ? 'ACCESS GRANTED' : 'CHECKED OUT')
                    : 'ACCESS DENIED',
                style: Theme.of(context).textTheme.headlineLarge!.copyWith(
                  color: Colors.white, fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 24),
              if (isAuthorized && result.visitor != null) ...[
                ResultInfoCard(
                  name: result.visitor!.name,
                  hostUnit: result.visitor!.hostUnit,
                  validTo: result.visitor!.validTo,
                  minutesRemaining: result.visitor?.minutesRemaining,
                  parkingSlot: result.visitor?.parkingSlot,
                ),
              ],
              if (!isAuthorized) ...[
                Text(
                  _reasonMessage(result.reason),
                  style: const TextStyle(color: Colors.white, fontSize: 18),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 48),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.white),
                onPressed: () => context.pop(),
                child: Text(
                  'Scan Next',
                  style: TextStyle(color: isAuthorized ? AppColors.success : AppColors.error),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _reasonMessage(String? reason) {
    return switch (reason) {
      'PASS_EXPIRED'       => 'This pass has expired.',
      'PASS_NOT_YET_VALID' => 'This pass is not yet valid.',
      'PASS_ALREADY_USED'  => 'This pass has already been used.',
      'PASS_CANCELLED'     => 'This pass has been cancelled.',
      'INVALID_QR'         => 'Invalid QR code. Not a visitor pass.',
      _                    => 'Access denied.',
    };
  }
}

// apps/security_app/lib/features/patrol/patrol_screen.dart
class PatrolScreen extends ConsumerWidget {
  const PatrolScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: PmsAppBar(title: 'Guard Patrol'),
      body: Column(children: [
        PatrolStatusHeader(),
        const Divider(),
        Expanded(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.qr_code_scanner, size: 80, color: AppColors.primary),
                const SizedBox(height: 24),
                const Text('Scan checkpoint QR code', style: TextStyle(fontSize: 18)),
                const SizedBox(height: 32),
                PmsButton(
                  label: 'Scan Checkpoint',
                  icon: Icons.qr_code_scanner,
                  isFullWidth: false,
                  onPressed: () => _scanCheckpoint(context, ref),
                ),
              ],
            ),
          ),
        ),
        PatrolLogsList(),
      ]),
    );
  }

  Future<void> _scanCheckpoint(BuildContext context, WidgetRef ref) async {
    final qrCode = await Navigator.push<String>(
      context, MaterialPageRoute(builder: (_) => const CheckpointQrScanner()),
    );
    if (qrCode == null) return;

    final position = await Geolocator.getCurrentPosition();
    await ref.read(patrolProvider.notifier).logCheckpoint(
      qrCode: qrCode,
      lat: position.latitude,
      lng: position.longitude,
    );
  }
}
```

---

## App 4 — Manager App

**Bundle ID:** `com.pms.manager`  
**Target Users:** Property managers and senior staff — approvals + oversight  
**Platform:** iOS + Android

### Directory Structure

```
apps/manager_app/
├── lib/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   │   ├── manager_dashboard.dart    # KPI overview across properties
│   │   │   ├── widgets/
│   │   │   │   ├── kpi_summary_row.dart
│   │   │   │   ├── occupancy_card.dart
│   │   │   │   ├── collection_card.dart
│   │   │   │   ├── open_tickets_card.dart
│   │   │   │   └── pending_approvals_card.dart
│   │   │   └── dashboard_provider.dart
│   │   ├── approvals/
│   │   │   ├── approvals_list_screen.dart  # pending workflow tasks
│   │   │   ├── approval_detail_screen.dart
│   │   │   └── approvals_provider.dart
│   │   ├── maintenance/
│   │   │   ├── maintenance_overview.dart   # property-level ticket summary
│   │   │   ├── ticket_list_screen.dart
│   │   │   └── ticket_assign_screen.dart
│   │   ├── reports/
│   │   │   ├── reports_screen.dart
│   │   │   ├── occupancy_report.dart
│   │   │   ├── collection_report.dart
│   │   │   └── reports_provider.dart
│   │   ├── notifications/
│   │   │   └── notifications_screen.dart
│   │   └── profile/
```

### Key Screens

```dart
// apps/manager_app/lib/features/dashboard/manager_dashboard.dart
class ManagerDashboard extends ConsumerWidget {
  const ManagerDashboard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashAsync = ref.watch(managerDashboardProvider);
    final selectedProperty = ref.watch(selectedPropertyProvider);

    return Scaffold(
      appBar: PmsAppBar(
        title: 'Dashboard',
        actions: [
          PropertySelectorDropdown(
            selected: selectedProperty,
            onChanged: (p) => ref.read(selectedPropertyProvider.notifier).state = p,
          ),
          const NotificationBell(),
        ],
      ),
      body: dashAsync.when(
        loading: () => const PmsLoadingWidget(),
        error: (e, _) => PmsErrorWidget(error: e),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.refresh(managerDashboardProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              KpiSummaryRow(
                occupancyRate: data.occupancyRate,
                collectionRate: data.collectionRate,
                openTickets: data.openTickets,
                pendingApprovals: data.pendingApprovals,
              ),
              const SizedBox(height: 16),
              if (data.pendingApprovals > 0)
                PendingApprovalsCard(count: data.pendingApprovals,
                  onTap: () => context.push('/approvals')),
              const SizedBox(height: 12),
              MaintenanceOverviewCard(data: data.maintenanceSummary,
                onTap: () => context.push('/maintenance')),
              const SizedBox(height: 12),
              CollectionSummaryCard(data: data.arSummary),
              const SizedBox(height: 12),
              SecurityIncidentsCard(incidents: data.recentIncidents),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const ManagerBottomNav(),
    );
  }
}

// apps/manager_app/lib/features/approvals/approval_detail_screen.dart
class ApprovalDetailScreen extends ConsumerWidget {
  final String taskId;
  const ApprovalDetailScreen({super.key, required this.taskId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final taskAsync = ref.watch(workflowTaskProvider(taskId));

    return Scaffold(
      appBar: PmsAppBar(title: 'Pending Approval'),
      body: taskAsync.when(
        loading: () => const PmsLoadingWidget(),
        error: (e, _) => PmsErrorWidget(error: e),
        data: (task) => Column(children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                ApprovalTaskHeader(task: task),
                const SizedBox(height: 16),
                EntityContextCard(task: task),   // shows lease/invoice/etc details
                const SizedBox(height: 16),
                WorkflowHistoryTimeline(history: task.instance.history),
              ]),
            ),
          ),
          ApprovalActionsBar(
            taskId: taskId,
            onApprove: (comments) async {
              await ref.read(approvalsProvider.notifier).approve(taskId, comments);
              if (context.mounted) context.pop();
            },
            onReject: (comments) async {
              await ref.read(approvalsProvider.notifier).reject(taskId, comments);
              if (context.mounted) context.pop();
            },
          ),
        ]),
      ),
    );
  }
}
```

---

## Flutter State Management (Riverpod)

```dart
// pms_core/lib/providers/api_providers.dart

// API client provider
@riverpod
ApiClient apiClient(ApiClientRef ref) {
  const storage = FlutterSecureStorage();
  return ApiClient(
    baseUrl: const String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.pms.com/api/v1'),
    storage: storage,
  );
}

// Generic async data provider pattern used across apps:
// apps/technician_app/lib/features/work_orders/wo_provider.dart
@riverpod
Future<List<WorkOrder>> myWorkOrders(MyWorkOrdersRef ref) async {
  final client = ref.watch(apiClientProvider);
  final user = ref.watch(authNotifierProvider).valueOrNull;
  if (user == null) return [];

  final response = await client.dio.get('/maintenance/work-orders', queryParameters: {
    'assignedTo': user.id,
    'status': 'pending,accepted,in_progress,on_hold',
    'limit': 50,
  });
  return (response.data['data'] as List)
      .map((j) => WorkOrder.fromJson(j as Map<String, dynamic>))
      .toList();
}

@riverpod
class WoNotifier extends _$WoNotifier {
  @override
  AsyncValue<void> build() => const AsyncData(null);

  Future<void> startWorkOrder(String woId) async {
    state = const AsyncLoading();
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post('/maintenance/work-orders/$woId/start');
      ref.invalidate(myWorkOrdersProvider);
      state = const AsyncData(null);
    } on DioException catch (e) {
      state = AsyncError(e, StackTrace.current);
    }
  }

  Future<void> completeWorkOrder({
    required String woId,
    required String completionNotes,
    required double actualHours,
    required List<ChecklistItemResult> checklistResults,
    required List<MaterialEntry> materialsUsed,
    required List<XFile> afterPhotos,
  }) async {
    state = const AsyncLoading();
    try {
      final client = ref.read(apiClientProvider);

      // Upload photos first
      final photoUrls = await _uploadPhotos(woId, afterPhotos, client);

      await client.dio.post('/maintenance/work-orders/$woId/complete', data: {
        'completionNotes': completionNotes,
        'actualHours': actualHours,
        'checklist': checklistResults.map((c) => c.toJson()).toList(),
        'materialsUsed': materialsUsed.map((m) => m.toJson()).toList(),
      });

      ref.invalidate(myWorkOrdersProvider);
      state = const AsyncData(null);
    } on DioException catch (e) {
      state = AsyncError(e, StackTrace.current);
    }
  }

  Future<List<String>> _uploadPhotos(String woId, List<XFile> photos, ApiClient client) async {
    final formData = FormData();
    for (final photo in photos) {
      final bytes = await photo.readAsBytes();
      formData.files.add(MapEntry(
        'photos',
        MultipartFile.fromBytes(bytes, filename: photo.name,
          contentType: DioMediaType('image', 'jpeg')),
      ));
    }
    formData.fields.add(const MapEntry('photoType', 'after'));
    final response = await client.dio.post(
      '/maintenance/tickets/$woId/photos', data: formData,
    );
    return (response.data['data'] as List).map((p) => p['url'] as String).toList();
  }
}
```

---

## Offline Support & Sync

```dart
// pms_core/lib/services/offline_queue.dart
// Stores failed API calls in Hive for retry when connectivity returns

@HiveType(typeId: 0)
class OfflineAction extends HiveObject {
  @HiveField(0) final String method;        // 'POST', 'PUT'
  @HiveField(1) final String endpoint;
  @HiveField(2) final Map<String, dynamic> body;
  @HiveField(3) final DateTime queuedAt;
  @HiveField(4) int retryCount;

  OfflineAction({
    required this.method,
    required this.endpoint,
    required this.body,
    required this.queuedAt,
    this.retryCount = 0,
  });
}

@riverpod
class OfflineQueueNotifier extends _$OfflineQueueNotifier {
  late Box<OfflineAction> _box;

  @override
  Future<void> build() async {
    _box = await Hive.openBox<OfflineAction>('offline_queue');
    // Listen for connectivity and flush queue
    ref.listen(connectivityProvider, (_, next) {
      if (next == ConnectivityResult.mobile || next == ConnectivityResult.wifi) {
        flushQueue();
      }
    });
  }

  Future<void> enqueue(String method, String endpoint, Map<String, dynamic> body) async {
    await _box.add(OfflineAction(
      method: method, endpoint: endpoint, body: body, queuedAt: DateTime.now(),
    ));
  }

  Future<void> flushQueue() async {
    final client = ref.read(apiClientProvider);
    final actions = _box.values.toList();

    for (final action in actions) {
      try {
        if (action.method == 'POST') {
          await client.dio.post(action.endpoint, data: action.body);
        } else if (action.method == 'PUT') {
          await client.dio.put(action.endpoint, data: action.body);
        }
        await action.delete();
      } catch (_) {
        action.retryCount++;
        await action.save();
        if (action.retryCount > 5) await action.delete(); // give up after 5 retries
      }
    }
  }
}

// Offline-first actions supported per app:
// Technician: WO start, WO complete, PM WO complete, checklist update
// Security:   Patrol checkpoint scan, incident create
// Resident:   Maintenance request submit (with photos queued separately)
// Manager:    Approve/reject tasks
```

---

## Push Notifications (FCM)

```dart
// pms_core/lib/services/notification_service.dart
class PmsNotificationService {
  static Future<void> initialize() async {
    await Firebase.initializeApp();

    // FCM setup
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    // Register token with backend
    final token = await messaging.getToken();
    if (token != null) await _registerToken(token);

    // Listen for token refresh
    messaging.onTokenRefresh.listen(_registerToken);

    // Foreground messages → in-app notification
    FirebaseMessaging.onMessage.listen((message) {
      _showInAppNotification(message);
    });

    // Background/terminated → opened via notification tap
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _handleNotificationNavigation(message);
    });
  }

  static Future<void> _registerToken(String token) async {
    // POST /push-tokens  { token, platform, deviceId }
    final platform = Platform.isIOS ? 'ios' : 'android';
    await apiClient.dio.post('/push-tokens', data: { 'token': token, 'platform': platform });
  }

  static void _handleNotificationNavigation(RemoteMessage message) {
    final data = message.data;
    final entityType = data['entityType'];
    final entityId = data['entityId'];
    final router = navigatorKey.currentContext != null
        ? GoRouter.of(navigatorKey.currentContext!)
        : null;

    switch (entityType) {
      case 'maintenance_ticket': router?.push('/maintenance/$entityId'); break;
      case 'work_order': router?.push('/work-orders/$entityId'); break;
      case 'invoice': router?.push('/invoices/$entityId'); break;
      case 'visitor_approval': router?.push('/visitors/approval/$entityId'); break;
      case 'workflow_task': router?.push('/approvals/$entityId'); break;
    }
  }
}
```

---

## Build & Release Configuration

### Flavors per App

```dart
// Each app has 3 flavors: development, staging, production
// apps/resident_app/lib/main_development.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PmsNotificationService.initialize();
  runApp(ProviderScope(
    overrides: [
      envProvider.overrideWithValue(AppEnvironment(
        apiBaseUrl: 'https://api-dev.pms.com/api/v1',
        appName: 'PMS Resident (Dev)',
        flavor: Flavor.development,
      )),
    ],
    child: const ResidentApp(),
  ));
}
```

### `melos.yaml` (Monorepo)

```yaml
name: pms_mobile
packages:
  - packages/**
  - apps/**

scripts:
  build:all:
    run: melos exec --scope="*_app" -- flutter build apk --flavor production
    description: Build all apps for production

  test:all:
    run: melos exec -- flutter test
    description: Run tests for all packages and apps

  gen:all:
    run: melos exec -- dart run build_runner build --delete-conflicting-outputs
    description: Run code generation for all packages

  clean:all:
    run: melos exec -- flutter clean

  l10n:all:
    run: melos exec -- flutter gen-l10n
    description: Generate localization files

  lint:
    run: melos exec -- flutter analyze
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/flutter_ci.yml
name: Flutter CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: '3.19.0', channel: 'stable' }
      - run: dart pub global activate melos
      - run: melos bootstrap
      - run: melos run gen:all
      - run: melos run test:all
      - run: melos run lint

  build-android:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [resident_app, technician_app, security_app, manager_app]
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: '3.19.0' }
      - run: dart pub global activate melos && melos bootstrap
      - name: Build APK
        run: |
          cd apps/${{ matrix.app }}
          flutter build apk --flavor production --release
      - name: Upload to Firebase App Distribution
        uses: wzieba/Firebase-Distribution-Github-Action@v1
        with:
          appId: ${{ secrets[format('{0}_APP_ID', matrix.app)] }}
          serviceCredentialsFileContent: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          groups: testers
          file: apps/${{ matrix.app }}/build/app/outputs/apk/production/release/app-production-release.apk

  build-ios:
    needs: test
    runs-on: macos-latest
    strategy:
      matrix:
        app: [resident_app, manager_app]
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { flutter-version: '3.19.0' }
      - run: dart pub global activate melos && melos bootstrap
      - name: Build IPA
        run: |
          cd apps/${{ matrix.app }}
          flutter build ipa --flavor production --release --export-options-plist=ios/ExportOptions.plist
```

### App Store / Play Store IDs

| App | Android Package | iOS Bundle ID | Play Store Track |
|-----|----------------|---------------|-----------------|
| Resident | `com.pms.resident` | `com.pms.resident` | Internal → Alpha → Production |
| Technician | `com.pms.technician` | `com.pms.technician` | Internal → Alpha |
| Security | `com.pms.security` | `com.pms.security` | Internal → Alpha |
| Manager | `com.pms.manager` | `com.pms.manager` | Internal → Alpha → Production |
