import { Create } from "@refinedev/antd";
import { useNavigate } from "react-router";
import { CustomerFormModal } from "./components/CustomerFormModal";

export const CustomerCreate = () => {
    const navigate = useNavigate();

    return (
        <Create
            breadcrumb={false}
            footerButtons={() => null}
            headerButtons={() => null}
            title={false}
        >
            <CustomerFormModal
                mode="create"
                onClose={() => navigate("/customers")}
                open
            />
        </Create>
    );
};
