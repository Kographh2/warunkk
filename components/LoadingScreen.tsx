'use client';

export function LoadingScreen({ label = 'Menyiapkan home warung digital...' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <div className="text-center px-4">
        <div className="loading-logo mx-auto mb-4">
          <span className="loading-mark">P</span>
        </div>
        <h1 className="fw-bold mb-2 loading-title">PRATAPA MART</h1>
        <p className="text-white-50 mb-4">{label}</p>
        <div className="loading-dots" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
