-- Migration: 003_create_permissions_table
-- Description: Creates the permissions table for RBAC system
-- Date: 2026-02-03

CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_resource (resource),
    INDEX idx_action (action),
    UNIQUE KEY unique_resource_action (resource, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default permissions for game management
INSERT INTO permissions (name, resource, action, description) VALUES
('game.create', 'game', 'create', 'Create new games'),
('game.read', 'game', 'read', 'View games'),
('game.update', 'game', 'update', 'Update game settings'),
('game.delete', 'game', 'delete', 'Delete games'),
('user.create', 'user', 'create', 'Create new users'),
('user.read', 'user', 'read', 'View users'),
('user.update', 'user', 'update', 'Update user details'),
('user.delete', 'user', 'delete', 'Delete users'),
('role.create', 'role', 'create', 'Create new roles'),
('role.read', 'role', 'read', 'View roles'),
('role.update', 'role', 'update', 'Update roles'),
('role.delete', 'role', 'delete', 'Delete roles'),
('permission.create', 'permission', 'create', 'Create new permissions'),
('permission.read', 'permission', 'read', 'View permissions'),
('permission.update', 'permission', 'update', 'Update permissions'),
('permission.delete', 'permission', 'delete', 'Delete permissions')
ON DUPLICATE KEY UPDATE description = VALUES(description);
