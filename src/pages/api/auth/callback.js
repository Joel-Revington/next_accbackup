import { getAccessToken } from "../services";// Adjust path as needed

export default async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code not provided.');
    }

    try {
        const tokenResponse = await getAccessToken(code);
        console.log("tokenRes",tokenResponse);
        
        const { access_token, refresh_token } = tokenResponse;

        // Store the access_token securely (e.g., session or cookie)
        res.setHeader('Set-Cookie', `access_token=${access_token}; HttpOnly; Path=/;`);

        res.redirect('/'); // Redirect to the home page or another route
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        res.status(500).send('Failed to authenticate.');
    }
}
