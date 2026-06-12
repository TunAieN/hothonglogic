import { Form, Upload, Typography } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { InboxOutlined, PaperClipOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderEditFormValues } from "../orderEditTypes";

const { Dragger } = Upload;
const { Text } = Typography;

type AttachmentsSectionProps = {
  fileList: UploadFile[];
  onChange: (files: UploadFile[]) => void;
  disabled?: boolean;
};

export const AttachmentsSection = ({
  fileList,
  onChange,
  disabled = false,
}: AttachmentsSectionProps) => (
  <OrderEditSectionCard icon={<PaperClipOutlined />} title="Tệp đính kèm">
    <Form.Item<OrderEditFormValues> style={{ marginBottom: 0 }}>
      <Dragger
        accept=".pdf,.jpg,.jpeg,.png"
        beforeUpload={() => false}
        disabled={disabled}
        fileList={fileList}
        itemRender={() => null}
        maxCount={5}
        multiple
        onChange={({ fileList: nextFileList }) => onChange(nextFileList)}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="order-edit-upload-title">Kéo thả hoặc chọn tệp để tải lên</p>
        <Text type="secondary">PDF, JPG, PNG - tối đa 10MB</Text>
      </Dragger>
    </Form.Item>
  </OrderEditSectionCard>
);
