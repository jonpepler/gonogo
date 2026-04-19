import type { DeviceInput, DeviceInputKind, DeviceType } from "@gonogo/core";
import { getSerialRenderStyles } from "@gonogo/core";
import {
  Button,
  Field,
  FieldLabel,
  FormActions,
  GhostButton,
  Input,
  PrimaryButton,
  Select,
} from "@gonogo/ui";
import { useMemo, useState } from "react";
import styled from "styled-components";

interface Props {
  initial?: DeviceType;
  onCancel: () => void;
  onSave: (type: DeviceType) => void;
}

interface DraftInput extends Partial<DeviceInput> {
  id: string;
  name: string;
  kind: DeviceInputKind;
}

function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "device-type"
  );
}

export function DeviceTypeEditor({
  initial,
  onCancel,
  onSave,
}: Readonly<Props>) {
  const renderStyles = useMemo(() => getSerialRenderStyles(), []);

  const [name, setName] = useState(initial?.name ?? "");
  const [renderStyleId, setRenderStyleId] = useState(
    initial?.renderStyleId ?? "",
  );
  const [inputs, setInputs] = useState<DraftInput[]>(
    (initial?.inputs as DraftInput[] | undefined) ?? [
      { id: "a", name: "A", kind: "button", offset: 1, length: 1 },
    ],
  );

  const updateInput = (idx: number, patch: Partial<DraftInput>) => {
    setInputs((prev) =>
      prev.map((input, i) => (i === idx ? { ...input, ...patch } : input)),
    );
  };

  const addInput = () => {
    setInputs((prev) => [
      ...prev,
      {
        id: `input-${prev.length + 1}`,
        name: "",
        kind: "button",
        offset: 0,
        length: 1,
      },
    ]);
  };

  const removeInput = (idx: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const type: DeviceType = {
      id: initial?.id ?? slug(name),
      name: name.trim(),
      parser: "char-position",
      renderStyleId: renderStyleId || undefined,
      inputs: inputs.map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
        offset: i.offset,
        length: i.length,
        min: i.min,
        max: i.max,
      })),
    };
    onSave(type);
  };

  return (
    <Wrap>
      <Field>
        <FieldLabel htmlFor="type-name">Type name</FieldLabel>
        <Input
          id="type-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cockpit Panel"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="type-render">Render Style</FieldLabel>
        <Select
          id="type-render"
          value={renderStyleId}
          onChange={(e) => setRenderStyleId(e.target.value)}
        >
          <option value="">— none —</option>
          {renderStyles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
            </option>
          ))}
        </Select>
      </Field>

      <InputsHeader>
        <FieldLabel>Inputs</FieldLabel>
        <Button type="button" onClick={addInput}>
          + add input
        </Button>
      </InputsHeader>
      {inputs.map((input, idx) => (
        <InputRow key={input.id}>
          <SmallField>
            <FieldLabel htmlFor={`input-id-${idx}`}>ID</FieldLabel>
            <Input
              id={`input-id-${idx}`}
              value={input.id}
              onChange={(e) => updateInput(idx, { id: e.target.value })}
            />
          </SmallField>
          <SmallField>
            <FieldLabel htmlFor={`input-name-${idx}`}>Name</FieldLabel>
            <Input
              id={`input-name-${idx}`}
              value={input.name}
              onChange={(e) => updateInput(idx, { name: e.target.value })}
            />
          </SmallField>
          <SmallField>
            <FieldLabel htmlFor={`input-kind-${idx}`}>Kind</FieldLabel>
            <Select
              id={`input-kind-${idx}`}
              value={input.kind}
              onChange={(e) =>
                updateInput(idx, {
                  kind: e.target.value as DeviceInputKind,
                })
              }
            >
              <option value="button">button</option>
              <option value="analog">analog</option>
            </Select>
          </SmallField>
          <TinyField>
            <FieldLabel htmlFor={`input-offset-${idx}`}>Offset</FieldLabel>
            <Input
              id={`input-offset-${idx}`}
              type="number"
              value={input.offset ?? ""}
              onChange={(e) =>
                updateInput(idx, { offset: Number(e.target.value) })
              }
            />
          </TinyField>
          <TinyField>
            <FieldLabel htmlFor={`input-length-${idx}`}>Length</FieldLabel>
            <Input
              id={`input-length-${idx}`}
              type="number"
              value={input.length ?? ""}
              onChange={(e) =>
                updateInput(idx, { length: Number(e.target.value) })
              }
            />
          </TinyField>
          {input.kind === "analog" && (
            <>
              <TinyField>
                <FieldLabel htmlFor={`input-min-${idx}`}>Min</FieldLabel>
                <Input
                  id={`input-min-${idx}`}
                  type="number"
                  value={input.min ?? ""}
                  onChange={(e) =>
                    updateInput(idx, { min: Number(e.target.value) })
                  }
                />
              </TinyField>
              <TinyField>
                <FieldLabel htmlFor={`input-max-${idx}`}>Max</FieldLabel>
                <Input
                  id={`input-max-${idx}`}
                  type="number"
                  value={input.max ?? ""}
                  onChange={(e) =>
                    updateInput(idx, { max: Number(e.target.value) })
                  }
                />
              </TinyField>
            </>
          )}
          <RemoveBtn
            type="button"
            onClick={() => removeInput(idx)}
            aria-label={`Remove input ${input.name || input.id}`}
          >
            ✕
          </RemoveBtn>
        </InputRow>
      ))}

      <FormActions>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSave}>Save type</PrimaryButton>
      </FormActions>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InputsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
`;

const InputRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: flex-end;
  background: #161616;
  border: 1px solid #222;
  border-radius: 4px;
  padding: 6px 8px;
`;

const SmallField = styled(Field)`
  flex: 1 1 80px;
  min-width: 0;
`;

const TinyField = styled(Field)`
  flex: 0 0 56px;
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 14px;
  padding: 6px;
  &:hover {
    color: #f87;
  }
`;
