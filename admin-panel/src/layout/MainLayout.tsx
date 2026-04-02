import { Layout, Menu } from 'antd';
import {
    UserOutlined,
    ShoppingCartOutlined,
    TeamOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
    const navigate = useNavigate();

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider>
                <h2 style={{ color: 'white', textAlign: 'center', padding: 10 }}>
                    Admin
                </h2>

                <Menu
                    theme="dark"
                    mode="inline"
                    onClick={(e) => navigate(e.key)}
                    items={[
                        { key: '/customers', icon: <TeamOutlined />, label: 'Customers' },
                        { key: '/orders', icon: <ShoppingCartOutlined />, label: 'Orders' },
                        { key: '/users', icon: <UserOutlined />, label: 'Users' }
                    ]}
                />
            </Sider>

            <Layout>
                <Header style={{ color: 'white' }}>
                    Tmall Admin
                </Header>

                <Content style={{ padding: 20 }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}