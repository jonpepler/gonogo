import styled from "styled-components";

export const ConfigForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: monospace;
`;

/** Vertical stack: label on top, input below */
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

/** Horizontal: label left, input right */
export const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const FieldLabel = styled.label`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
`;

export const FieldHint = styled.span`
  font-size: 10px;
  color: #444;
`;

export const FormActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const inputBase = `
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: #555;
  }
`;

export const Input = styled.input`
  ${inputBase}
  width: 100%;
`;

export const Select = styled.select`
  ${inputBase}
  width: 100%;
`;

export const Textarea = styled.textarea`
  ${inputBase}
  width: 100%;
  resize: vertical;
`;
