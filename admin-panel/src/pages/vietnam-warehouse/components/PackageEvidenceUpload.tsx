import { useState } from "react";
import { Image, Upload, message } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";

export const MAX_PACKAGE_EVIDENCE_IMAGES = 5;
export const MAX_PACKAGE_EVIDENCE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
  existingCount?: number;
  disabled?: boolean;
};

const readFileAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export const PackageEvidenceUpload = ({ files, onChange, existingCount = 0, disabled }: Props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const availableSlots = Math.max(0, MAX_PACKAGE_EVIDENCE_IMAGES - existingCount);

  const beforeUpload: UploadProps["beforeUpload"] = (file, selectedFiles) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      message.error(`${file.name}: Chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP.`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_PACKAGE_EVIDENCE_SIZE) {
      message.error(`${file.name}: Ảnh vượt quá dung lượng cho phép (tối đa 5 MB).`);
      return Upload.LIST_IGNORE;
    }
    const selectedIndex = selectedFiles.findIndex((selected) => selected.uid === file.uid);
    if (files.length + selectedIndex >= availableSlots) {
      if (files.length + selectedFiles.length > availableSlots && selectedIndex === 0) message.error("Mỗi mã vận đơn chỉ được tải tối đa 5 ảnh.");
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const preview = async (file: UploadFile) => {
    const source = file.url || file.preview || (file.originFileObj ? await readFileAsDataUrl(file.originFileObj) : "");
    if (!source) return;
    setPreviewImage(source);
    setPreviewOpen(true);
  };

  return <>
    <Upload
      accept=".jpg,.jpeg,.png,.webp"
      listType="picture-card"
      fileList={files}
      beforeUpload={beforeUpload}
      onPreview={(file) => void preview(file)}
      onChange={({ fileList }) => onChange(fileList.slice(0, availableSlots))}
      maxCount={availableSlots}
      multiple
      disabled={disabled || availableSlots === 0}
    >
      {files.length < availableSlots ? <div><CameraOutlined /><div style={{ marginTop: 6 }}>Thêm ảnh</div></div> : null}
    </Upload>
    {previewImage ? <Image wrapperStyle={{ display: "none" }} preview={{ visible: previewOpen, onVisibleChange: setPreviewOpen, afterOpenChange: (visible) => { if (!visible) setPreviewImage(""); } }} src={previewImage} /> : null}
  </>;
};
