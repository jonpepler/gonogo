import styled from "styled-components";

/** Default action button — neutral dark style */
export const Button = styled.button`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #aaa;
  font-family: monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  padding: 5px 12px;
  cursor: pointer;
  text-transform: uppercase;
  transition: border-color 0.1s, color 0.1s;

  &:hover {
    border-color: #555;
    color: #ddd;
  }
  &:active {
    background: #222;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/** Confirm / save — green accent */
export const PrimaryButton = styled(Button)`
  background: #1a3a1a;
  border-color: #2a5a2a;
  color: #00cc66;
  align-self: flex-end;

  &:hover {
    background: #1f4a1f;
    border-color: #3a7a3a;
    color: #00ff88;
  }
`;

/** Ghost / cancel — no background */
export const GhostButton = styled(Button)`
  background: none;
  border-color: #333;
  color: #666;

  &:hover {
    border-color: #555;
    color: #aaa;
  }
`;

/** Icon-only button — no chrome, just text/icon */
export const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #555;
  font-size: 13px;
  line-height: 1;
  padding: 2px 4px;
  transition: color 0.1s;

  &:hover {
    color: #aaa;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;
