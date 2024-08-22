import { getAuthorizationUrl } from "../services"

export default function handler(req, res) {
    const authUrl = getAuthorizationUrl();
    console.log(authUrl);
    res.redirect(authUrl)
}
