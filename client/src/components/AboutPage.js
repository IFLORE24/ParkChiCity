function AboutPage({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '32px',
          boxSizing: 'border-box',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          position: 'relative'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            fontSize: '24px',
            color: '#888',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '4px 8px'
          }}
          aria-label="Close"
        >
          ×
        </button>

        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', color: '#1a1a2e' }}>
          About ParkChiCity
        </h2>

        <Section title="What this app is">
          <p>
            ParkChiCity is a visual guide to Chicago's residential parking permit zones.
            It overlays the city's official permit zone data on an interactive map, helping
            drivers quickly identify where permit-only parking restrictions apply.
          </p>
        </Section>

        <Section title="Data sources">
          <p>
            Permit zone data comes from the{' '}
            <a href="https://data.cityofchicago.org/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Chicago Data Portal
            </a>
            , the city's official open data repository. Street geometry comes from{' '}
            <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              OpenStreetMap
            </a>
            {' '}via the Overpass API. The Chicago boundary is fetched from the city's official
            GIS dataset and used to filter out streets outside city limits.
          </p>
        </Section>

        <Section title="Known limitations">
          <p>
            <strong>This is a V1 prototype.</strong> The most significant limitation is that
            permit zones are currently shown at the full-street level, not block-by-block.
            Chicago's permit data is recorded with address ranges (e.g., "N Kenmore Ave from
            2400 to 2459"), but V1 simplifies this by coloring an entire street red if any
            block of it is in a permit zone.
          </p>
          <p>
            <strong>Practical impact:</strong> some streets show as permit-required when only
            a few blocks actually are. V2 will use Chicago's Address Points dataset to
            translate address ranges into precise coordinates for block-level accuracy.
          </p>
        </Section>

        <Section title="Disclaimer">
          <p>
            <strong>Always verify with posted signs before parking.</strong> This app is for
            informational purposes only and may contain errors or out-of-date information.
            Parking regulations, permit zone boundaries, and enforcement areas change over time.
            The author is not responsible for parking tickets, towing fees, or other
            consequences of relying on this app's information.
          </p>
        </Section>

        <Section title="About the developer">
          <p>
            Built by Isaiah Flores, a Computer Science student at DePaul University.
            Source code, technical details, and contribution guidelines are available on{' '}
            <a href="https://github.com/" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              GitHub
            </a>
            . {/* TODO: replace with actual repo URL after first push */}
          </p>
        </Section>
      </div>
    </div>
  );
}

// Helper component for consistent section styling
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        margin: '0 0 8px 0',
        fontSize: '14px',
        fontWeight: '600',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {title}
      </h3>
      <div style={{ fontSize: '15px', color: '#333', lineHeight: '1.6' }}>
        {children}
      </div>
    </div>
  );
}

const linkStyle = {
  color: '#3a4a8a',
  textDecoration: 'underline'
};

export default AboutPage;