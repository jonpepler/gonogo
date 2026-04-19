import styled from "styled-components";

export const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
`;

export const PanelTitle = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #666;
`;

export const PanelSubtitle = styled.div`
  font-size: 12px;
  color: #888;
  letter-spacing: 0.05em;
  margin-top: -4px;
`;

export const PanelScrollable = styled(Panel)`
  overflow: auto;
`;

export const Placeholder = styled.span`
  font-size: 12px;
  color: #444;
`;
