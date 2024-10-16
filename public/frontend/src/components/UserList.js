import React, {useState, useEffect} from 'react';
import {Table, Button} from 'antd';
import axios from 'axios';

const UserList = ({apiRootUrl, onUserSelect, menus}) => {
    const [users, setUsers] = useState([]);
    const [lastUserKey, setLastUserKey] = useState();
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const columns = [
        {title: 'ID', dataIndex: 'user_id', key: 'user_id'},
        {title: 'City', dataIndex: 'shipping_city', key: 'shipping_city'},
        {title: 'State', dataIndex: 'shipping_state', key: 'shipping_state'},
        {title: 'Created At', dataIndex: 'created_at', key: 'created_at'},
        {title: 'locale', dataIndex: 'locale', key: 'locale'},
    ];

    const fetchUsers = async (menus = null, offset = 0, limit = 10) => {
        setLoading(true);
        try {
            let itemIds = null
            if (menus) {
                itemIds = menus.map(menu => menu.item_id)
                if (itemIds.length === 0) {
                    return;
                }
            }
            const response = await axios.get(`${apiRootUrl}/users`, {
                params: {offset, limit, itemIds},
            });
            setUsers(response.data.users);
            setLastUserKey(response.data.lastEvaluatedKey.user_id);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers(menus);
    }, [menus]);

    const handleNext = () => {
        fetchUsers(menus, lastUserKey);
    };

    const renderFooter = () => {
        return (
            <Button onClick={handleNext} disabled={!lastUserKey}>
                Load More
            </Button>
        );
    };

    const onSelectChange = (newSelectedRowKeys) => {
        setSelectedRowKeys(newSelectedRowKeys);
        if (newSelectedRowKeys.length > 0) {
            onUserSelect(newSelectedRowKeys[0]);
        } else {
            onUserSelect(null);
        }
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: onSelectChange,
        type: 'radio', // This ensures only one row can be selected at a time
    };

    return (
        <div style={{margin: 10}}>
            <h2>User List</h2>

                <Table
                    loading={loading}
                    columns={columns}
                    dataSource={users}
                    rowKey="user_id"
                    footer={renderFooter}
                    rowSelection={rowSelection}
                    size="small"
                    onRow={(record) => ({
                        onClick: () => {
                            onSelectChange([record.user_id]);
                        },
                    })}
                />

        </div>
    );
};

export default UserList;