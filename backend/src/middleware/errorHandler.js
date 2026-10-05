export const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err)
    console.error('❌ ERROR:', err.message)

    if (err.code === 'ER_DUP_ENTRY') {
        const detail = err.sqlMessage ? `: ${err.sqlMessage}` : ''
        return res.status(409).json({ success: false, message: `Data sudah ada (duplikat)${detail}` })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ success: false, message: 'Referensi data tidak valid' })
    }
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({ success: false, message: 'Data masih dipakai, tidak bisa dihapus' })
    }

    const statusCode = err.statusCode || 500
    return res.status(statusCode).json({ success: false, message: err.message || 'Internal Server Error' })
}