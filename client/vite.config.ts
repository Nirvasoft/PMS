import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const RUNTIME_BRIDGE_SCRIPT = `<script>
(function () {
  var p = window.location.pathname;
  var isPmsCtx = p === '/pms' || p.indexOf('/pms/') === 0;
  document.write('<base href="' + (isPmsCtx ? '/pms/' : '/') + '">');

  if (!isPmsCtx) return;

  var proxyBase = '/pms/__backend';
  var ASSET_RE = /^\\/(api|uploads|seed-photos|storage)(\\/|$)/;
  var rewriteUrl = function (u) {
    return typeof u === 'string' && ASSET_RE.test(u) ? proxyBase + u : u;
  };

  var OrigRequest = window.Request;
  function PatchedRequest(input, init) {
    return new OrigRequest(typeof input === 'string' ? rewriteUrl(input) : input, init);
  }
  PatchedRequest.prototype = OrigRequest.prototype;
  Object.setPrototypeOf(PatchedRequest, OrigRequest);
  window.Request = PatchedRequest;

  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string') return origFetch(rewriteUrl(input), init);
    return origFetch(input, init);
  };

  var origOpen = window.open;
  if (origOpen) {
    window.open = function (url, target, features) {
      return origOpen.call(this, typeof url === 'string' ? rewriteUrl(url) : url, target, features);
    };
  }

  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if ((name === 'src' || name === 'href') && typeof value === 'string') {
      return origSetAttr.call(this, name, rewriteUrl(value));
    }
    return origSetAttr.call(this, name, value);
  };

  ['HTMLImageElement:src', 'HTMLAnchorElement:href', 'HTMLIFrameElement:src', 'HTMLSourceElement:src', 'HTMLMediaElement:src'].forEach(function (item) {
    var parts = item.split(':');
    var ctor = window[parts[0]];
    if (!ctor) return;
    var desc = Object.getOwnPropertyDescriptor(ctor.prototype, parts[1]);
    if (desc && desc.set) {
      Object.defineProperty(ctor.prototype, parts[1], {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function (val) {
          desc.set.call(this, typeof val === 'string' ? rewriteUrl(val) : val);
        }
      });
    }
  });
})();
</script>`

const PROXY_SERVLET_JAVA = `import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.servlet.*;
import javax.servlet.http.*;

public class PmsProxyServlet extends HttpServlet {
  private static String readLine(InputStream in) throws IOException {
    ByteArrayOutputStream buf = new ByteArrayOutputStream(128);
    int b;
    while ((b = in.read()) != -1) {
      if (b == '\\n') break;
      if (b != '\\r') buf.write(b);
    }
    if (b == -1 && buf.size() == 0) return null;
    return new String(buf.toByteArray(), StandardCharsets.ISO_8859_1);
  }

  @Override
  protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
    String uri = req.getRequestURI();
    int idx = uri.indexOf("/__backend");
    String targetPath = idx >= 0 ? uri.substring(idx + 10) : req.getPathInfo();
    if (targetPath == null || targetPath.isEmpty()) targetPath = "/";
    String qs = req.getQueryString();
    String fullPath = targetPath + (qs != null && !qs.isEmpty() ? "?" + qs : "");
    String method = req.getMethod();

    ByteArrayOutputStream reqBody = new ByteArrayOutputStream();
    if (req.getContentLength() > 0 || req.getHeader("Transfer-Encoding") != null) {
      try (InputStream in = req.getInputStream()) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) reqBody.write(buf, 0, n);
      }
    }

    try (Socket sock = new Socket("127.0.0.1", 3000)) {
      sock.setSoTimeout(300000);
      OutputStream sockOut = new BufferedOutputStream(sock.getOutputStream());
      StringBuilder reqHead = new StringBuilder(512);
      reqHead.append(method).append(" ").append(fullPath).append(" HTTP/1.1\\r\\n");
      reqHead.append("Host: 127.0.0.1:3000\\r\\n");
      reqHead.append("Connection: close\\r\\n");

      Enumeration<String> names = req.getHeaderNames();
      while (names != null && names.hasMoreElements()) {
        String h = names.nextElement();
        if ("host".equalsIgnoreCase(h) || "connection".equalsIgnoreCase(h) || "content-length".equalsIgnoreCase(h) || "transfer-encoding".equalsIgnoreCase(h) || "expect".equalsIgnoreCase(h) || "origin".equalsIgnoreCase(h) || "referer".equalsIgnoreCase(h)) continue;
        Enumeration<String> vals = req.getHeaders(h);
        while (vals.hasMoreElements()) {
          reqHead.append(h).append(": ").append(vals.nextElement()).append("\\r\\n");
        }
      }

      byte[] bodyBytes = reqBody.toByteArray();
      if (bodyBytes.length > 0 || "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method) || "PATCH".equalsIgnoreCase(method)) {
        reqHead.append("Content-Length: ").append(bodyBytes.length).append("\\r\\n");
      }
      reqHead.append("\\r\\n");
      sockOut.write(reqHead.toString().getBytes(StandardCharsets.ISO_8859_1));
      if (bodyBytes.length > 0) sockOut.write(bodyBytes);
      sockOut.flush();

      InputStream sockIn = new BufferedInputStream(sock.getInputStream());
      String statusLine = readLine(sockIn);
      if (statusLine == null) {
        resp.setStatus(502);
        return;
      }
      String[] parts = statusLine.split(" ");
      int status = parts.length > 1 ? Integer.parseInt(parts[1]) : 200;
      resp.setStatus(status);

      boolean isChunked = false;
      String line;
      while ((line = readLine(sockIn)) != null && !line.isEmpty()) {
        int colon = line.indexOf(':');
        if (colon <= 0) continue;
        String k = line.substring(0, colon).trim();
        String v = line.substring(colon + 1).trim();
        if ("transfer-encoding".equalsIgnoreCase(k)) {
          if (v.toLowerCase().contains("chunked")) isChunked = true;
          continue;
        }
        if ("connection".equalsIgnoreCase(k) || "content-length".equalsIgnoreCase(k) || "cross-origin-resource-policy".equalsIgnoreCase(k) || "content-security-policy".equalsIgnoreCase(k)) continue;
        resp.addHeader(k, v);
      }

      if (status == 204 || status == 304 || "HEAD".equalsIgnoreCase(method)) return;

      OutputStream respOut = resp.getOutputStream();
      byte[] buf = new byte[8192];
      if (isChunked) {
        while (true) {
          String sizeLine = readLine(sockIn);
          if (sizeLine == null) break;
          int semi = sizeLine.indexOf(';');
          if (semi > 0) sizeLine = sizeLine.substring(0, semi);
          int chunkSize = Integer.parseInt(sizeLine.trim(), 16);
          if (chunkSize == 0) break;
          int rem = chunkSize;
          while (rem > 0) {
            int n = sockIn.read(buf, 0, Math.min(buf.length, rem));
            if (n == -1) break;
            respOut.write(buf, 0, n);
            rem -= n;
          }
          readLine(sockIn);
        }
      } else {
        int n;
        while ((n = sockIn.read(buf)) != -1) {
          respOut.write(buf, 0, n);
        }
      }
      respOut.flush();
    }
  }
}
`

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' ? './' : '/'),
  plugins: [
    {
      name: 'pms-deploy-bundle',
      enforce: 'pre',
      transform(code, id) {
        if (id.replace(/\\/g, '/').endsWith('/src/App.tsx')) {
          return code
            .replace(
              "window.location.href = '/login'",
              "window.location.href = (window.location.pathname.startsWith('/pms') ? '/pms/login' : '/login')",
            )
            .replace(
              '<BrowserRouter>',
              "<BrowserRouter basename={window.location.pathname.startsWith('/pms') ? '/pms' : '/'}>",
            )
        }
      },
      transformIndexHtml(html) {
        return html.replace('<head>', `<head>\n    ${RUNTIME_BRIDGE_SCRIPT}`)
      },
      closeBundle() {
        const distDir = path.resolve(process.cwd(), 'dist')
        if (!fs.existsSync(distDir)) return

        const metaInfDir = path.join(distDir, 'META-INF')
        const webInfDir = path.join(distDir, 'WEB-INF')
        const classesDir = path.join(webInfDir, 'classes')
        fs.mkdirSync(metaInfDir, { recursive: true })
        fs.mkdirSync(classesDir, { recursive: true })

        fs.writeFileSync(
          path.join(metaInfDir, 'context.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<Context>\n  <Valve className="org.apache.catalina.valves.rewrite.RewriteValve" />\n</Context>\n`,
        )

        const javaFile = path.join(classesDir, 'PmsProxyServlet.java')
        fs.writeFileSync(javaFile, PROXY_SERVLET_JAVA)
        const javacExe = 'C:\\Program Files\\Java\\jdk-1.8\\bin\\javac.exe'
        const servletJar = 'C:\\Program Files\\Apache Software Foundation\\Tomcat 8.0\\lib\\servlet-api.jar'
        let hasProxyClass = false
        try {
          if (fs.existsSync(javacExe) && fs.existsSync(servletJar)) {
            execSync(`"${javacExe}" -source 1.8 -target 1.8 -cp "${servletJar}" "${javaFile}"`, { stdio: 'ignore' })
            hasProxyClass = fs.existsSync(path.join(classesDir, 'PmsProxyServlet.class'))
          }
        } catch {
          // Ignore if JDK / Tomcat servlet-api is unavailable on build machine
        } finally {
          if (fs.existsSync(javaFile)) fs.unlinkSync(javaFile)
        }

        const servletXml = hasProxyClass
          ? `  <servlet>\n    <servlet-name>PmsProxyServlet</servlet-name>\n    <servlet-class>PmsProxyServlet</servlet-class>\n  </servlet>\n  <servlet-mapping>\n    <servlet-name>PmsProxyServlet</servlet-name>\n    <url-pattern>/__backend/*</url-pattern>\n  </servlet-mapping>\n`
          : ''

        fs.writeFileSync(
          path.join(webInfDir, 'web.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"\n         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee http://xmlns.jcp.org/xml/ns/javaee/web-app_3_1.xsd"\n         version="3.1">\n  <display-name>PMS Frontend</display-name>\n${servletXml}  <welcome-file-list>\n    <welcome-file>index.html</welcome-file>\n  </welcome-file-list>\n  <error-page>\n    <error-code>404</error-code>\n    <location>/index.html</location>\n  </error-page>\n</web-app>\n`,
        )

        fs.writeFileSync(
          path.join(webInfDir, 'rewrite.config'),
          `RewriteRule ^/(__backend|assets|reports)/.*$ - [L]\nRewriteRule ^/.*\\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|json|map|html)$ - [L]\nRewriteRule ^/.*$ /index.html [L]\n`,
        )

        try {
          const zipFile = path.join(distDir, 'pms.zip')
          const warFile = path.join(distDir, 'pms.war')
          if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile)
          if (fs.existsSync(warFile)) fs.unlinkSync(warFile)
          execSync('tar -a -c -f pms.zip index.html favicon.svg icons.svg v6erp-logo.png META-INF WEB-INF assets reports', {
            cwd: distDir,
            stdio: 'ignore',
          })
          fs.renameSync(zipFile, warFile)
        } catch {
          // Ignore war packaging errors if tar is unavailable
        }
      },
    },
    react(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/seed-photos': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
