import axios from "axios";

const API = axios.create({
    baseURL: "http://localhost:8000/graphql",
});

// tự động gắn token
API.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token) {
        config.headers.Authorization = "Bearer " + token;
    }

    return config;
});

export const graphql = async (query: string, variables: any = {}) => {
    const res = await API.post("", {
        query,
        variables,
    });

    return res.data;
};