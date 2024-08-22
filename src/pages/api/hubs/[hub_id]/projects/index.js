import { authRefreshMiddleware, getProjects } from "@/pages/api/services";

export default async function handler(req, res) {
    const { hub_id } = req.query;
    try {
        const projects = await getProjects(hub_id, req.cookies.access_token);
        res.status(200).json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}