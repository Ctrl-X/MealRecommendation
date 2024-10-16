import React, {useState, useEffect} from 'react';
import {Table, Checkbox} from 'antd';
import axios from 'axios';

const UserInteractions = ({apiRootUrl, userId, onCheckMenu,selectedMenu, checkedItemIds}) => {
    const [interactions, setInteractions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchInteractions = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                // Fetch user interactions
                const interactionsResponse = await axios.get(`${apiRootUrl}/users`, {
                    params: {
                        type: 'interactions',
                        user_id: userId,
                    },
                });
                const interactionsData = interactionsResponse.data.interactions;

                // Extract all unique item IDs from interactions
                const itemIds = [...new Set(interactionsData.map(interaction => interaction.item_id))];

                // Fetch menu details for all items in a single request
                const menuResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {item_id: itemIds.join(',')},
                });

                // Create a map of item_id to menu details for quick lookup
                const menuMap = menuResponse.data.reduce((acc, menu) => {
                    acc[menu.item_id] = menu;
                    return acc;
                }, {});

                // Combine interactions data with menu details
                const interactionsWithMenuDetails = interactionsData.map(interaction => ({
                    ...interaction,
                    menuName: menuMap[interaction.item_id]?.name || 'Unknown',
                    price: menuMap[interaction.item_id]?.price || 'N/A',
                }));

                setInteractions(interactionsWithMenuDetails);
            } catch (error) {
                console.error('Error fetching interactions:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInteractions();
    }, [apiRootUrl, userId]);

    const columns = [
        {
            title: 'Select',
            dataIndex: 'item_id',
            key: 'select',
            render: (itemId,item) => (
                <Checkbox
                    checked={selectedMenu && selectedMenu.item_id === itemId}
                    onChange={(e) => onCheckMenu(itemId, e.target.checked, item)}
                />
            ),
        },
        {
            title: 'Time',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (timestamp) => new Date(timestamp * 1000).toLocaleDateString(),
        },
        {title: 'Item Id', dataIndex: 'item_id', key: 'item_id'},
        {title: 'Menu Name', dataIndex: 'menuName', key: 'menuName'},
        {
            title: 'Action',
            dataIndex: 'event_type',
            key: 'event_type',
            render: (eventType) => {
                switch (eventType) {
                    case 'Watch':
                        return '+3 rating';
                    case 'Click':
                        return 'Selection';
                    default:
                        return eventType;
                }
            },
        },
    ];

    return (
        <div style={{margin:10}}>
            <h2>User Interactions</h2>
            <Table loading={loading} size="small" columns={columns} dataSource={interactions} rowKey="item_id"/>
        </div>
    );
};

export default UserInteractions;