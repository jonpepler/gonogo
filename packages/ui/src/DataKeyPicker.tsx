import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

export interface KeyOption {
  key: string;
  label?: string;
  unit?: string;
  group?: string;
}

export interface DataKeyPickerProps {
  keys: KeyOption[];
  value: string | null;
  onChange: (key: string | null) => void;
  clearable?: boolean;
  placeholder?: string;
}

function matches(option: KeyOption, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const label = option.label ?? option.key;
  return label.toLowerCase().includes(q) || option.key.toLowerCase().includes(q);
}

export function DataKeyPicker({
  keys,
  value,
  onChange,
  clearable = false,
  placeholder = "Search…",
}: DataKeyPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = keys.find((k) => k.key === value);

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

  const flatOptions = useMemo(
    () => sortedGroups.flatMap(([, items]) => items),
    [sortedGroups],
  );

  const openPicker = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }, []);

  const selectOption = useCallback(
    (key: string) => {
      onChange(key);
      closePicker();
    },
    [onChange, closePicker],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === "ArrowDown") openPicker();
      return;
    }
    if (e.key === "Escape") {
      closePicker();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Arrow-highlighted item first; fall back to first filtered result so
      // "type a partial label + Enter" works without needing an arrow key.
      const opt =
        activeIndex >= 0 ? flatOptions[activeIndex] : flatOptions[0];
      if (opt) selectOption(opt.key);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) closePicker();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, closePicker]);

  const displayValue = open
    ? query
    : (selectedOption?.label ?? value ?? "");

  return (
    <Container ref={containerRef}>
      <PickerInput
        ref={inputRef}
        value={displayValue}
        placeholder={value ? undefined : placeholder}
        $hasValue={!!value && !open}
        onFocus={openPicker}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {clearable && value && !open && (
        <ClearButton
          type="button"
          onClick={() => {
            onChange(null);
            closePicker();
          }}
        >
          ×
        </ClearButton>
      )}
      {open && (
        <Dropdown>
          {flatOptions.length === 0 ? (
            <EmptyState>No matches</EmptyState>
          ) : (
            sortedGroups.map(([group, items]) => (
              <DropdownGroup key={group}>
                <GroupHeader>{group}</GroupHeader>
                {items.map((opt) => {
                  const globalIdx = flatOptions.indexOf(opt);
                  return (
                    <DropdownItem
                      key={opt.key}
                      $active={globalIdx === activeIndex}
                      $selected={opt.key === value}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(opt.key);
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                    >
                      <ItemLabel>{opt.label ?? opt.key}</ItemLabel>
                      {opt.unit && <ItemUnit>{opt.unit}</ItemUnit>}
                    </DropdownItem>
                  );
                })}
              </DropdownGroup>
            ))
          )}
        </Dropdown>
      )}
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  font-family: monospace;
`;

const PickerInput = styled.input<{ $hasValue: boolean }>`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: ${({ $hasValue }) => ($hasValue ? "#ccc" : "#888")};
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

const ClearButton = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;

  &:hover {
    color: #ccc;
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 100;
`;

const DropdownGroup = styled.div``;

const GroupHeader = styled.div`
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #555;
  padding: 8px 8px 4px;
  position: sticky;
  top: 0;
  background: #1a1a1a;
`;

const DropdownItem = styled.div<{ $active: boolean; $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  cursor: pointer;
  background: ${({ $active, $selected }) =>
    $active ? "#2a2a2a" : $selected ? "#1e2e1e" : "transparent"};

  &:hover {
    background: #2a2a2a;
  }
`;

const ItemLabel = styled.span`
  font-size: 12px;
  color: #ccc;
`;

const ItemUnit = styled.span`
  font-size: 10px;
  color: #555;
  margin-left: 6px;
`;

const EmptyState = styled.div`
  padding: 12px 8px;
  font-size: 12px;
  color: #555;
  text-align: center;
`;
