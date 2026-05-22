import { Form, Input } from "antd";
import { AlignLeftOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderEditFormValues } from "../orderEditTypes";

const { TextArea } = Input;

export const NotesSection = () => (
  <OrderEditSectionCard icon={<AlignLeftOutlined />} title="Ghi chú">
    <Form.Item<OrderEditFormValues> name="note" style={{ marginBottom: 0 }}>
      <TextArea
        autoSize={{ minRows: 8, maxRows: 10 }}
        placeholder="Add any special instructions or order notes here..."
      />
    </Form.Item>
  </OrderEditSectionCard>
);
