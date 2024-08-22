import { getProjectContents } from "@/pages/api/services";

export default async function handler(req, res) {
    const { hub_id, project_id } = req.query;
    const { folder_id } = req.query;

    try {
        const contents = await getProjectContents(hub_id, project_id, folder_id, req.cookies.access_token);
        res.status(200).json(contents);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}