export function About() {
  return (
    <div className="page">
      <h2>About</h2>
      <p>
        This page exists to verify that nginx serves <code>/about</code> via
        SPA fallback (<code>try_files $uri /index.html</code>). If you can
        refresh this page without a 404, the config is correct.
      </p>
    </div>
  );
}
