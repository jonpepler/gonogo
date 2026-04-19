import type { ReactNode } from "react";
import styled from "styled-components";

export interface TabDescriptor {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabDescriptor[];
  activeId: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeId, onChange }: Readonly<TabsProps>) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <TabsRoot>
      <TabBar role="tablist">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active?.id}
            $active={tab.id === active?.id}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabBar>
      <TabPanel role="tabpanel">{active?.content}</TabPanel>
    </TabsRoot>
  );
}

const TabsRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TabBar = styled.div`
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #222;
`;

const TabButton = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? "#1a1a1a" : "transparent")};
  border: none;
  color: ${({ $active }) => ($active ? "#ccc" : "#555")};
  cursor: pointer;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 6px 12px;
  border-bottom: 2px solid
    ${({ $active }) => ($active ? "#00cc66" : "transparent")};
  margin-bottom: -1px;

  &:hover {
    color: #aaa;
  }
`;

const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
`;
