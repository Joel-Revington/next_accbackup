export default async function handler(req, res) {
    const token = req.cookies.access_token;

    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
        // Send the token response back to the client
        res.status(200).json({ access_token: token });
    } catch (error) {
        console.error('Error retrieving token:', error);
        res.status(500).json({ message: 'Failed to retrieve token' });
    }
}
