// pages/api/auth/check.js
export default function handler(req, res) {
    // Check if the access token exists in cookies or session
    const token = req.cookies.access_token;

    if (token) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
}
