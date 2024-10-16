import React from 'react';
import { Table, Checkbox, Progress } from 'antd';

const MenuList = ({ menus, onCheckMenu, checkedItemIds, totalUsers, selectedMenu, loading }) => {
    const columns = [
        {
            title: 'Select',
            dataIndex: 'item_id',
            key: 'select',
            render: (itemId) => (
                <Checkbox
                    checked={checkedItemIds.includes(itemId)}
                    onChange={(e) => onCheckMenu(itemId, e.target.checked)}
                />
            ),
        },
        {
            title: 'Item ID',
            dataIndex: 'item_id',
            key: 'item_id',
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Similarity Score',
            dataIndex: 'score',
            key: 'score',
            render: (score) => (
                <Progress
                    percent={Number((score * 100).toFixed(2))}
                    size={[100, 20]}
                    percentPosition={{ align: 'end', type: 'inner' }}
                />
            ),
        },
        {
            title: 'Potential users',
            dataIndex: 'userCount',
            key: 'userCount',
            render: (userCount) => (
                <Progress
                    percent={totalUsers ? Math.round(100* userCount/totalUsers) : 0}
                    percentPosition={{ align: 'end', type: 'outer' }}
                    size={[100, 20]}
                    format={(percent) => `${userCount ||  0}`}
                />
            ),
        },
    ];

    return (
        <div style={{margin: 10}}>
            <h2>Similar Menus {selectedMenu ? "for " + selectedMenu.name : ""}</h2>
            <Table
                loading={loading}
            columns={columns}
            dataSource={menus}
            rowKey="item_id"
            pagination={false}
        />
        </div>
    );
};

export default MenuList;