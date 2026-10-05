import jwt from 'jsonwebtoken'

/** Terima token dari header Authorization maupun query `?token=` (untuk <img>). */
const bacaToken = (req) => {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1]
    return req.query?.token || null
}

export const verifyToken = (req, res, next) => {
    const token = bacaToken(req)
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token tidak ditemukan' })
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET)
        next()
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Sesi berakhir, silakan login ulang' })
        }
        return res.status(401).json({ success: false, message: 'Token tidak valid' })
    }
}