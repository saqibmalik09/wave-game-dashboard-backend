-- Migration: 002_create_roles_table
-- Description: Creates the roles table for RBAC system
-- Date: 2026-02-03

CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_is_system_role (is_system_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert super_admin role (protected system role)
INSERT INTO roles (name, description, is_system_role) 
VALUES ('super_admin', 'Super Administrator with all permissions', true)
ON DUPLICATE KEY UPDATE description = 'Super Administrator with all permissions';
