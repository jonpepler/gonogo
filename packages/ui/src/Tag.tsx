import styled, { css } from 'styled-components';

// ---------------------------------------------------------------------------
// Colour map for known tags
// ---------------------------------------------------------------------------

const TAG_COLOURS: Record<string, { bg: string; fg: string; border: string }> = {
  telemetry: { bg: '#0a1a0a', fg: '#00cc66', border: '#1a3a1a' },
  control:   { bg: '#1a1000', fg: '#cc8800', border: '#3a2800' },
  system:    { bg: '#0a0a1a', fg: '#4488ff', border: '#1a1a3a' },
  kos:       { bg: '#1a0a1a', fg: '#cc44cc', border: '#3a1a3a' },
};

const FALLBACK = { bg: '#111', fg: '#666', border: '#222' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TagProps {
  label: string;
}

export function Tag({ label }: TagProps) {
  const colours = TAG_COLOURS[label] ?? FALLBACK;
  return (
    <TagBadge $bg={colours.bg} $fg={colours.fg} $border={colours.border}>
      {label}
    </TagBadge>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const TagBadge = styled.span<{ $bg: string; $fg: string; $border: string }>`
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  ${({ $bg, $fg, $border }) => css`
    background: ${$bg};
    color: ${$fg};
    border: 1px solid ${$border};
  `}
`;
