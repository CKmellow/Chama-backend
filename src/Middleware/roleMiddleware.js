export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role
    if (!userRole) return res.status(401).json({ error: 'No user role found' })

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    next()
  }
}
