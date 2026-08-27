import type { ReactNode } from "react";
import { Card, Col, Row, Skeleton, Space, Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";

type SkeletonRow = {
  id: string;
};

type AdminTableSkeletonProps<T extends object> = {
  columns: ColumnsType<T>;
  rowCount?: number;
  scroll?: { x?: number | string; y?: number | string };
  rowSelection?: boolean;
};

type LoadingOverlayProps = {
  children: ReactNode;
  spinning: boolean;
  tip?: string;
};

type SkeletonFieldGridProps = {
  columns?: number;
  fields: Array<{ span?: number; labelWidth?: number | string; inputWidth?: number | string }>;
};

export const LoadingOverlay = ({ children, spinning, tip = "Đang cập nhật dữ liệu..." }: LoadingOverlayProps) => (
  <Spin spinning={spinning} tip={tip}>
    {children}
  </Spin>
);

export const SkeletonLine = ({ width = "100%" }: { width?: number | string }) => (
  <Skeleton.Input active size="small" style={{ width }} />
);

export const SkeletonBlock = ({ height = 40 }: { height?: number | string }) => (
  <Skeleton.Node active style={{ display: "block", height, width: "100%" }} />
);

export const SkeletonStatCard = ({ labelWidth = 92, valueWidth = 56 }: { labelWidth?: number; valueWidth?: number }) => (
  <Card size="small">
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <SkeletonLine width={labelWidth} />
      <SkeletonLine width={valueWidth} />
    </Space>
  </Card>
);

export const SkeletonFieldGrid = ({ columns = 3, fields }: SkeletonFieldGridProps) => (
  <Row gutter={[16, 8]}>
    {fields.map((field, index) => (
      <Col xs={24} md={12} xl={field.span ?? Math.floor(24 / columns)} key={index}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <SkeletonLine width={field.labelWidth ?? 88} />
          <SkeletonLine width={field.inputWidth ?? "100%"} />
        </Space>
      </Col>
    ))}
  </Row>
);

export const AdminTableSkeleton = <T extends object>({
  columns,
  rowCount = 8,
  scroll,
  rowSelection,
}: AdminTableSkeletonProps<T>) => {
  const skeletonColumns = columns.map((column, index) => ({
    ...column,
    render: () => <SkeletonLine width={index === columns.length - 1 ? 72 : "78%"} />,
  })) as ColumnsType<SkeletonRow>;

  const dataSource: SkeletonRow[] = Array.from({ length: rowCount }).map((_, index) => ({
    id: `loading-${index}`,
  }));

  return (
    <Table<SkeletonRow>
      rowKey="id"
      columns={skeletonColumns}
      dataSource={dataSource}
      pagination={false}
      scroll={scroll}
      rowSelection={rowSelection ? { selectedRowKeys: [], onChange: () => undefined } : undefined}
    />
  );
};

export const RouteLoadingFallback = () => (
  <div style={{ padding: 24 }}>
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <SkeletonLine width={180} />
      <Card size="small">
        <SkeletonBlock height={96} />
      </Card>
    </Space>
  </div>
);
