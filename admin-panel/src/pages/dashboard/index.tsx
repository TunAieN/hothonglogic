
import { Row, Col, Typography, Button, Table, Space, Avatar } from "antd";
import { PlusOutlined, ClockCircleOutlined, EnvironmentOutlined } from "@ant-design/icons";
import mapImage from "../../assets/map.png";

const { Title, Text } = Typography;

export const DashboardPage = () => {
  const tableData = [
    {
      key: '1',
      id: '#DRV-8901',
      name: 'Jameson Miller',
      avatar: 'https://i.pravatar.cc/150?img=33',
      vehicle: 'Volvo FH16 • 44-BB-92',
      status: 'ACTIVE',
      progress: 72,
      efficiency: '98.4%',
    },
    {
      key: '2',
      id: '#DRV-7723',
      name: 'Leila Vance',
      avatar: 'https://i.pravatar.cc/150?img=47',
      vehicle: 'Isuzu NPR • 12-XZ-01',
      status: 'AT REST',
      progress: 100,
      efficiency: '94.1%',
    },
    {
      key: '3',
      id: '#DRV-6651',
      name: 'Marcus Reid',
      avatar: 'https://i.pravatar.cc/150?img=12',
      vehicle: 'Scania R500 • 09-RR-45',
      status: 'DELAYED',
      progress: 34,
      efficiency: '82.0%',
    },
  ];

  const columns = [
    {
      title: 'DRIVER ID',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => <div style={{ color: 'var(--bg-dark)', fontWeight: 700, fontSize: 13 }}>{text}</div>,
    },
    {
      title: 'OPERATOR NAME',
      key: 'name',
      render: (_: any, record: any) => (
        <Space size={12}>
          <Avatar src={record.avatar} size={32} />
          <span style={{ fontWeight: 600, color: '#1A202C' }}>{record.name}</span>
        </Space>
      ),
    },
    {
      title: 'VEHICLE',
      dataIndex: 'vehicle',
      key: 'vehicle',
      render: (text: string) => <span style={{ color: '#4A5568', fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusClass = status === 'ACTIVE' ? 'status-active' : status === 'AT REST' ? 'status-rest' : 'status-delayed';
        return <span className={`status-badge ${statusClass}`}>{status}</span>;
      },
    },
    {
      title: 'ROUTE PROGRESS',
      key: 'progress',
      render: (_: any, record: any) => (
        <div className="progress-container" style={{ width: 140 }}>
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${record.status === 'DELAYED' ? 'danger' : ''}`}
              style={{ width: `${record.progress}%` }}
            />
          </div>
          <div className="progress-text">
            {record.progress === 100 ? 'Done' : `${record.progress}%`}
          </div>
        </div>
      ),
    },
    {
      title: 'EFFICIENCY',
      dataIndex: 'efficiency',
      key: 'efficiency',
      align: 'right' as const,
      render: (text: string) => <span style={{ fontWeight: 700, color: '#1A202C' }}>{text}</span>,
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <div className="panel-card" style={{ padding: 0, overflow: 'hidden', height: 380, position: 'relative' }}>
            {/* Map Placeholder Area */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: '#A3B8AD',
              backgroundImage: `url(${mapImage})`,
              backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.8
            }}></div>

            {/* Top Left Badge */}
            <div style={{
              position: 'absolute', top: 20, left: 20,
              background: '#fff', borderRadius: 20, padding: '8px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              fontWeight: 700, fontSize: 12, color: '#1A202C'
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }}></div>
              LIVE: 142 Active Units
            </div>

            {/* Simulated Map Markers */}
            <div style={{ position: 'absolute', top: '35%', left: '45%', transform: 'translate(-50%, -50%)' }}>
              <div style={{ background: '#0B192C', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <EnvironmentOutlined style={{ fontSize: 14 }} />
              </div>
            </div>

            <div style={{ position: 'absolute', top: '65%', left: '35%', transform: 'translate(-50%, -50%)' }}>
              <div style={{ background: '#10B981', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <EnvironmentOutlined style={{ fontSize: 14 }} />
              </div>
            </div>

            <div style={{ position: 'absolute', top: '55%', left: '65%', transform: 'translate(-50%, -50%)' }}>
              <div style={{ background: '#EF4444', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                <EnvironmentOutlined style={{ fontSize: 14 }} />
              </div>
            </div>

            {/* Network Pulse Card Overlay */}
            <div className="panel-card-dark" style={{
              position: 'absolute', bottom: 20, left: 20,
              width: 260, padding: 20,
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>NETWORK PULSE</div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8 }}>
                  <span>ON SCHEDULE</span>
                  <span style={{ color: '#10B981' }}>88%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '88%', background: '#10B981', borderRadius: 3 }}></div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8 }}>
                  <span>IDLE CAPACITY</span>
                  <span style={{ color: '#F59E0B' }}>12%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '12%', background: '#F59E0B', borderRadius: 3 }}></div>
                </div>
              </div>
            </div>
          </div>
        </Col>

        <Col span={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
            {/* Avg Delivery Time */}
            <div className="panel-card-dark" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#94A3B8' }}>
                  AVG. DELIVERY TIME
                </div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClockCircleOutlined style={{ fontSize: 16 }} />
                </div>
              </div>
              <div style={{ fontSize: 42, fontWeight: 700, marginTop: 8, lineHeight: 1 }}>
                24.5<span style={{ fontSize: 16, fontWeight: 500, color: '#94A3B8', marginLeft: 4 }}>min</span>
              </div>

              {/* Fake Bar Chart */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 24 }}>
                {[45, 60, 30, 20, 50, 80, 40].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: i === 5 ? '#6EE7B7' : '#34D399', height: `${h}%`, opacity: i === 5 ? 1 : 0.4, borderRadius: '4px 4px 0 0' }}></div>
                ))}
              </div>
            </div>

            {/* Fuel Efficiency */}
            <div className="panel-card" style={{ flex: 1, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#64748B' }}>
                  FUEL EFFICIENCY
                </div>
                <div style={{ backgroundColor: '#ECFDF5', color: '#10B981', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EnvironmentOutlined style={{ fontSize: 16 }} />
                </div>
              </div>
              <div style={{ fontSize: 42, fontWeight: 700, marginTop: 8, lineHeight: 1, color: '#0B192C' }}>
                9.2<span style={{ fontSize: 16, fontWeight: 500, color: '#64748B', marginLeft: 4 }}>km/l</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#10B981', marginTop: 16 }}>
                ↗ +4.2% from last week
              </div>

              {/* Fake Sparkline SVG */}
              <div style={{ position: 'absolute', bottom: 20, right: 20, width: 120, height: 50 }}>
                <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                  <path d="M0,25 Q10,25 15,20 T30,22 T45,15 T55,25 T65,10 T75,28 T85,5 T95,20 L100,20" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <div className="panel-card" style={{ padding: '24px 0' }}>
        <div style={{ padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 700, fontSize: 20, color: '#0B192C' }}>Fleet Driver Manifest</Title>
            <Text style={{ color: '#64748B' }}>Real-time shift tracking and performance metrics</Text>
          </div>
          <Space>
            <Button size="large" style={{ backgroundColor: '#0B192C', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0 20px' }} icon={<PlusOutlined />}>
              Add Driver
            </Button>
            <Button size="large" style={{ backgroundColor: '#F1F5F9', color: '#1A202C', fontWeight: 600, border: 'none', borderRadius: 8, padding: '0 20px' }}>
              Export CSV
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={tableData}
          pagination={false}
          className="manifest-table"
          rowClassName={() => 'manifest-row'}
        />
      </div>

      {/* Styles for Table specifically */}
      <style>{`
        .manifest-table .ant-table-thead > tr > th {
          background: transparent !important;
          color: #94A3B8 !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          letter-spacing: 0.5px !important;
          text-transform: uppercase !important;
          border-bottom: 1px solid #E2E8F0 !important;
          padding: 16px 24px !important;
        }
        .manifest-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #F1F5F9 !important;
          padding: 20px 24px !important;
        }
        .manifest-table .ant-table-tbody > tr:hover > td {
          background: #F8FAFC !important;
        }
      `}</style>
    </div>
  );
};
