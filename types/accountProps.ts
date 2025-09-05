export enum UserRoleType {
    admin = 'ADMIN',
    user = 'USER'
}


export const UserRoleDetail = [
    {
        value: 'ADMIN',
        name: 'Admin',
        description: 'Can edit routes, and change organization settings.',
    },
    {
        value: 'USER',
        name: 'User',
        description: 'Can only view routes.',
    }
]
