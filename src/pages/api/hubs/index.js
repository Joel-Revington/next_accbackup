import { getHubs } from "../services";

export default async function handler(req, res) {
    
    try {
        const accessToken = req.cookies.access_token;
        // Example function to get hubs
        const hubs = await getHubs(accessToken);

        res.status(200).json(hubs);
    } catch (err) {
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}