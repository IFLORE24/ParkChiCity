function Sidebar({ onAboutClick }) {
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      height: '100vh',
      width: '260px',
      backgroundColor: '#1a1a2e',
      color: 'white',
      zIndex: 1,
      padding: '24px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* App Name with Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img
          src="/parkChiCity_logo.png"
          alt="ParkChiCity logo"
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'contain',
            flexShrink: 0
          }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#ffffff' }}>
            ParkChiCity
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#888' }}>
            Chicago Street Parking Guide
          </p>
        </div>
      </div>

      {/* Legend */}
      <div>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Legend
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{ width: '24px', height: '4px', backgroundColor: '#FF4444', borderRadius: '2px' }} />
          <span style={{ fontSize: '14px' }}>Permit Zone</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '24px', height: '4px', backgroundColor: '#6b7785', borderRadius: '2px' }} />
          <span style={{ fontSize: '14px' }}>Non-Permit Streets</span>
        </div>
      </div>

      {/* Spacer pushes the About button to the bottom */}
      <div style={{ flex: 1 }} />

      {/* About button */}
      <button
        onClick={onAboutClick}
        style={{
          backgroundColor: 'transparent',
          border: '1px solid #444',
          color: '#ccc',
          padding: '10px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#252540';
          e.currentTarget.style.borderColor = '#666';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderColor = '#444';
        }}
      >
        About & Disclaimer
      </button>
    </div>
  );
}

export default Sidebar;