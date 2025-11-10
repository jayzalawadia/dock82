import React from 'react';

// Modern Premium Logo Component for Dock82
export const Dock82Logo = ({
  width = 40,
  height = 40,
  includeText = true,
  variant = 'full',
}) => {
  if (variant === 'icon') {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="boatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>
          <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Background */}
        <circle cx="100" cy="100" r="100" fill="#F0F9FF" />

        {/* Water waves */}
        <g opacity="0.8">
          <path
            d="M 0 130 Q 50 120 100 130 T 200 130 L 200 200 L 0 200 Z"
            fill="url(#waterGradient)"
          />
        </g>

        {/* Speedboat - Modern sleek design */}
        <g filter="url(#shadow)">
          {/* Boat hull */}
          <path
            d="M 50 110 L 75 95 L 150 95 Q 165 100 165 110 L 160 125 Q 155 130 140 130 L 60 130 Q 50 128 50 120 Z"
            fill="url(#boatGradient)"
            stroke="none"
          />

          {/* Boat cabin/windshield */}
          <path
            d="M 95 85 L 130 85 L 135 100 L 90 105 Z"
            fill="#0EA5E9"
            opacity="0.9"
          />
          <path
            d="M 97 87 L 128 87 L 132 97 L 100 100 Z"
            fill="#06B6D4"
            opacity="0.6"
          />

          {/* Cabin details */}
          <rect x="105" y="90" width="8" height="6" fill="#E0F2FE" rx="1" opacity="0.8" />

          {/* Boat top/canopy */}
          <path
            d="M 100 80 L 140 80 Q 145 80 145 85 L 140 90 L 95 90 Z"
            fill="#0369A1"
            opacity="0.7"
          />

          {/* Water splash effect */}
          <path
            d="M 65 130 Q 68 138 60 140"
            stroke="#60A5FA"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
          <path
            d="M 150 128 Q 155 140 148 145"
            stroke="#60A5FA"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
        </g>

        {/* Dock posts */}
        <rect x="35" y="130" width="5" height="40" fill="#92400E" rx="2" />
        <rect x="160" y="130" width="5" height="40" fill="#92400E" rx="2" />

        {/* Number 82 */}
        <text
          x="100"
          y="175"
          fontSize="18"
          fontWeight="900"
          textAnchor="middle"
          fill="#1E40AF"
          fontFamily="'Arial', 'Helvetica', sans-serif"
          letterSpacing="1"
        >
          82
        </text>
      </svg>
    );
  }

  // Full logo with text
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.2s',
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="boatGradientFull" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E40AF" />
          </linearGradient>
          <linearGradient id="waterGradientFull" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <filter id="shadowFull" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        <circle cx="100" cy="100" r="100" fill="#F0F9FF" />

        <g opacity="0.8">
          <path
            d="M 0 130 Q 50 120 100 130 T 200 130 L 200 200 L 0 200 Z"
            fill="url(#waterGradientFull)"
          />
        </g>

        <g filter="url(#shadowFull)">
          <path
            d="M 50 110 L 75 95 L 150 95 Q 165 100 165 110 L 160 125 Q 155 130 140 130 L 60 130 Q 50 128 50 120 Z"
            fill="url(#boatGradientFull)"
            stroke="none"
          />

          <path
            d="M 95 85 L 130 85 L 135 100 L 90 105 Z"
            fill="#0EA5E9"
            opacity="0.9"
          />
          <path
            d="M 97 87 L 128 87 L 132 97 L 100 100 Z"
            fill="#06B6D4"
            opacity="0.6"
          />

          <rect x="105" y="90" width="8" height="6" fill="#E0F2FE" rx="1" opacity="0.8" />

          <path
            d="M 100 80 L 140 80 Q 145 80 145 85 L 140 90 L 95 90 Z"
            fill="#0369A1"
            opacity="0.7"
          />

          <path
            d="M 65 130 Q 68 138 60 140"
            stroke="#60A5FA"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
          <path
            d="M 150 128 Q 155 140 148 145"
            stroke="#60A5FA"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />
        </g>

        <rect x="35" y="130" width="5" height="40" fill="#92400E" rx="2" />
        <rect x="160" y="130" width="5" height="40" fill="#92400E" rx="2" />

        <text
          x="100"
          y="175"
          fontSize="18"
          fontWeight="900"
          textAnchor="middle"
          fill="#1E40AF"
          fontFamily="'Arial', 'Helvetica', sans-serif"
          letterSpacing="1"
        >
          82
        </text>
      </svg>

      {includeText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: '900',
              color: '#1E40AF',
              letterSpacing: '-0.5px',
              lineHeight: '1.2',
            }}
          >
            DOCK 82
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#0EA5E9',
              fontWeight: '700',
              letterSpacing: '0.5px',
              lineHeight: '1',
            }}
          >
            JOSE&apos;S HIDEAWAY
          </div>
        </div>
      )}
    </div>
  );
};

// Premium Multi-Variant Logos
export const Dock82LogoVariants = () => {
  return (
    <div
      style={{
        padding: '40px',
        backgroundColor: '#F8FAFC',
        borderRadius: '12px',
      }}
    >
      <h2 style={{ marginBottom: '30px', color: '#1E3A8A', fontWeight: '900' }}>
        Modern DOCK 82 Logo Variants
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '30px',
        }}
      >
        {/* Variant 1: Header Logo */}
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #E0E7FF',
          }}
        >
          <div
            style={{
              marginBottom: '15px',
              paddingBottom: '15px',
              borderBottom: '2px solid #E0E7FF',
            }}
          >
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '12px',
                fontWeight: '700',
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Header Logo
            </p>
            <Dock82Logo width={50} height={50} includeText variant="full" />
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
            Use in header with text for primary branding
          </p>
        </div>

        {/* Variant 2: Icon Only */}
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #E0E7FF',
          }}
        >
          <div
            style={{
              marginBottom: '15px',
              paddingBottom: '15px',
              borderBottom: '2px solid #E0E7FF',
              display: 'flex',
              gap: '15px',
              alignItems: 'center',
            }}
          >
            <div>
              <p
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                Icon Badge
              </p>
              <Dock82Logo width={48} height={48} includeText={false} variant="icon" />
            </div>
            <div>
              <p
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                Small Icon
              </p>
              <Dock82Logo width={32} height={32} includeText={false} variant="icon" />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
            Perfect for favicons and buttons
          </p>
        </div>

        {/* Variant 3: Mobile Header */}
        <div
          style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #E0E7FF',
          }}
        >
          <div
            style={{
              marginBottom: '15px',
              paddingBottom: '15px',
              borderBottom: '2px solid #E0E7FF',
            }}
          >
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '12px',
                fontWeight: '700',
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Mobile Header
            </p>
            <Dock82Logo width={40} height={40} includeText={false} variant="icon" />
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
            Icon-only for mobile navigation headers
          </p>
        </div>
      </div>

      {/* Brand Colors */}
      <div
        style={{
          marginTop: '40px',
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          border: '1px solid #E0E7FF',
        }}
      >
        <h3 style={{ margin: '0 0 20px 0', color: '#1E3A8A', fontWeight: '700' }}>
          Official Brand Colors
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '100%',
                height: '60px',
                backgroundColor: '#1E40AF',
                borderRadius: '8px',
                marginBottom: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            />
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#1E40AF' }}>
              #1E40AF
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748B' }}>
              Primary Navy
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '100%',
                height: '60px',
                backgroundColor: '#3B82F6',
                borderRadius: '8px',
                marginBottom: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            />
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#3B82F6' }}>
              #3B82F6
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748B' }}>Sky Blue</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '100%',
                height: '60px',
                backgroundColor: '#0EA5E9',
                borderRadius: '8px',
                marginBottom: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            />
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#0EA5E9' }}>
              #0EA5E9
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748B' }}>
              Cyan Accent
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '100%',
                height: '60px',
                backgroundColor: '#06B6D4',
                borderRadius: '8px',
                marginBottom: '10px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            />
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#06B6D4' }}>
              #06B6D4
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748B' }}>
              Turquoise
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dock82LogoVariants;

