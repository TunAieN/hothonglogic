import { Table } from "antd";
import { useEffect, useState } from "react";
import { graphql } from "../services/api";

interface OrderItem {
    id: string;
    product_name: string;
    price_cny: number;
    quantity: number;
    note?: string;
}

interface Order {
    id: string;
    total_amount: number;
    customer: {
        name: string;
    };
    items: OrderItem[];
}

export default function Orders() {
    const [data, setData] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);

        try {
            const res = await graphql(`
        query {
          orders {
            id
            total_amount
            customer {
              name
            }
            items {
              id
              product_name
              price_cny
              quantity
            }
          }
        }
      `);

            setData(res.data.orders);
        } catch (err) {
            console.error(err);
        }

        setLoading(false);
    };

    return (
        <Table
            loading={loading}
            dataSource={data}
            rowKey="id"
            expandable={{
                expandedRowRender: (record) => (
                    <Table
                        dataSource={record.items}
                        rowKey="id"
                        pagination={false}
                        columns={[
                            { title: "Tên SP", dataIndex: "product_name" },
                            { title: "Giá", dataIndex: "price_cny" },
                            { title: "Số lượng", dataIndex: "quantity" },
                        ]}
                    />
                ),
            }}
            columns={[
                { title: "ID", dataIndex: "id" },
                { title: "Khách hàng", dataIndex: ["customer", "name"] },
                { title: "Tổng tiền (¥)", dataIndex: "total_amount" },
            ]}
        />
    );
}