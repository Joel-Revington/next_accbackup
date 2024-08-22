import { getItemVersions } from "@/pages/api/services";

export default async function handler(req, res) {
    const { project_id, item_id } = req.query;

    try {
        const contents = await getItemVersions(project_id, item_id, req.cookies.access_token);
        res.status(200).json(contents);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}