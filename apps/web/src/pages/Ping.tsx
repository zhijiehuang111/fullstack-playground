export function Ping() {
  return (
    <div className="page">
      <h2>Ping</h2>
      <p>pong — {new Date().toISOString()}</p>
      <p>
        Another route to confirm deep-link refresh works through nginx.
      </p>
    </div>
  );
}
