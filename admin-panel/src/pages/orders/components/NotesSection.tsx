import { Form, Input } from "antd";
import { AlignLeftOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderEditFormValues } from "../orderEditTypes";

const { TextArea } = Input;

type NotesSectionProps = {
  disabled?: boolean;
};

export const NotesSection = ({ disabled = false }: NotesSectionProps) => (
  <OrderEditSectionCard icon={<AlignLeftOutlined />} title="Ghi chú">
    <Form.Item<OrderEditFormValues> name="note" style={{ marginBottom: 0 }}>
      <TextArea
        disabled={disabled}
        autoSize={{ minRows: 8, maxRows: 10 }}
        placeholder="Nhập ghi chú liên quan đến đơn hàng..."
      />
    </Form.Item>
  </OrderEditSectionCard>
);
