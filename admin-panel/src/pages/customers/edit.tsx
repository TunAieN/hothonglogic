import { Edit } from "@refinedev/antd";
import { useNavigate, useParams } from "react-router";
import { CustomerFormModal } from "./components/CustomerFormModal";

export const CustomerEdit = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    return (
        <Edit
            breadcrumb={false}
            footerButtons={() => null}
            headerButtons={() => null}
            title={false}
        >
            <CustomerFormModal
                customerId={id}
                mode="edit"
                onClose={() => navigate("/customers")}
                open
            />
        </Edit>
    );
};
