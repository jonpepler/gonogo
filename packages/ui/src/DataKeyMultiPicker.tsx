import { useMemo, useState } from "react";
import styled from "styled-components";
import type { KeyOption } from "./DataKeyPicker";

export interface DataKeyMultiPickerProps {
  keys: KeyOption[];
  value: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  /** Optional hint shown when the filtered list is empty. */
  emptyHint?: string;
}

function matches(option: KeyOption, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const label = option.label ?? option.key;
  return (
    label.toLowerCase().includes(q) || option.key.toLowerCase().includes(q)
  );
}

export function DataKeyMultiPicker({
  keys,
  value,
  onChange,
  placeholder = "Search…",
  emptyHint = "No matches",
}: DataKeyMultiPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => keys.filter((k) => matches(k, query)),
    [keys, query],
  );

  const sortedGroups = useMemo(() => {
    const groups = new Map<string, KeyOption[]>();
    for (const k of filtered) {
      const g = k.group ?? "Other";
      let bucket = groups.get(g);
      if (!bucket) {
        bucket = [];
        groups.set(g, bucket);
      }
      bucket.push(k);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggle = (key: string) => {
    const next = new Set(value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <Container>
      <SearchInput
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      <List>
        {sortedGroups.length === 0 ? (
          <Empty>{emptyHint}</Empty>
        ) : (
          sortedGroups.map(([group, items]) => (
            <Group key={group}>
              <GroupHeader>{group}</GroupHeader>
              {items.map((opt) => {
                const checked = value.has(opt.key);
                const id = `dkmp-${opt.key}`;
                return (
                  <Row key={opt.key} $checked={checked}>
                    <HiddenCheckbox
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.key)}
                    />
                    <RowLabel htmlFor={id}>
                      <Box $checked={checked}>{checked ? "✓" : ""}</Box>
                      <ItemLabel>{opt.label ?? opt.key}</ItemLabel>
                      {opt.unit && <ItemUnit>{opt.unit}</ItemUnit>}
                    </RowLabel>
                  </Row>
                );
              })}
            </Group>
          ))
        )}
      </List>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: monospace;
`;

const SearchInput = styled.input`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;
  box-sizing: border-box;
  width: 100%;

  &:focus {
    border-color: #555;
  }

  &::placeholder {
    color: #555;
  }
`;

const List = styled.div`
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  max-height: 260px;
  overflow-y: auto;
`;

const Group = styled.div``;

const GroupHeader = styled.div`
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #555;
  padding: 8px 8px 4px;
  position: sticky;
  top: 0;
  background: #141414;
`;

const Row = styled.div<{ $checked: boolean }>`
  background: ${({ $checked }) => ($checked ? "#1e2e1e" : "transparent")};

  &:hover {
    background: #202020;
  }
`;

const HiddenCheckbox = styled.input`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
`;

const RowLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  cursor: pointer;
  user-select: none;
`;

const Box = styled.span<{ $checked: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid ${({ $checked }) => ($checked ? "#3a6f3a" : "#444")};
  background: ${({ $checked }) => ($checked ? "#2b4a2b" : "#1a1a1a")};
  color: #cfe;
  font-size: 10px;
  line-height: 1;
  border-radius: 2px;
  flex: 0 0 auto;
`;

const ItemLabel = styled.span`
  font-size: 12px;
  color: #ccc;
  flex: 1;
`;

const ItemUnit = styled.span`
  font-size: 10px;
  color: #555;
  margin-left: 6px;
`;

const Empty = styled.div`
  padding: 12px 8px;
  font-size: 12px;
  color: #555;
  text-align: center;
`;
