import { getUserProfile } from "../services";

export default async function handler(req, res) {
    try {
        // Wait for the promise to resolve
        const userName = await getUserProfile(req.cookies.access_token);
        console.log(userName.name);
        
        // Send the user name as the response
        res.status(200).send({name: userName.name});
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send('Failed to retrieve user profile.');
    }
}
