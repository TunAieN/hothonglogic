import { Table } from "antd";
import { useEffect, useState } from "react";
import { graphql } from "../services/api";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

export default function Customers() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);

    try {
      const res = await graphql(`
        query {
          customers {
            id
            name
            phone
            email
          }
        }
      `);

      setData(res.data.customers);
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
      columns={[
        { title: "ID", dataIndex: "id" },
        { title: "Tên", dataIndex: "name" },
        { title: "SĐT", dataIndex: "phone" },
        { title: "Email", dataIndex: "email" },
      ]}
    />
  );
}