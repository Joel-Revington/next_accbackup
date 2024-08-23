export default function handler(req, res) {
    const { access_token } = req.cookies;

    if (!access_token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    res.status(200).json({ access_token });
}
