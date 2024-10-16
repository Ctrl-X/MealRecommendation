import React, {useState, useEffect} from 'react';
import {Table, Checkbox} from 'antd';
import axios from 'axios';

const MostPopular = ({apiRootUrl, userId, onCheckMenu, checkedItemIds}) => {
    const [mostPopular, setMostPopular] = useState([]);
    const [loading, setLoading] = useState(false);

    const columns = [
        {
            title: 'Select',
            dataIndex: 'itemId',
            key: 'select',
            render: (itemId) => (
                <Checkbox
                    checked={checkedItemIds.includes(itemId)}
                    onChange={(e) => onCheckMenu(itemId, e.target.checked)}
                />
            ),
        },
        {title: '#', dataIndex: 'number', key: 'number'},
        {title: 'Item id', dataIndex: 'itemId', key: 'itemId'},
        {title: 'Menu name', dataIndex: 'menuName', key: 'menuName'},
    ];

    useEffect(() => {
        const fetchMostPopular = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                // First API call to get the list of most popular items
                const mostPopularResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {
                        type: 'popular',
                        user_id: userId,
                    },
                });

                // Extract all item IDs from the most popular items
                const itemIds = mostPopularResponse.data.map(item => item.itemId);

                // Single API call to get menu details for all items
                const menuResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {item_id: itemIds.join(',')},
                });

                // Create a map of item_id to menu details for quick lookup
                const menuMap = menuResponse.data.reduce((acc, menu) => {
                    acc[menu.item_id] = menu;
                    return acc;
                }, {});

                // Combine most popular data with menu details
                const detailedMostPopular = mostPopularResponse.data.map((item, index) => {
                    const menu = menuMap[item.itemId] || {};
                    return {
                        number: index + 1,
                        itemId: item.itemId,
                        menuName: menu.name || 'N/A'
                    };
                });

                setMostPopular(detailedMostPopular);
            } catch (error) {
                console.error('Error fetching most popular items:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMostPopular();
    }, [apiRootUrl, userId]);

    return (
        <div style={{margin:10}}>
            <h2>Most Popular</h2>

            <Table loading={loading} columns={columns} dataSource={mostPopular} rowKey="itemId" size="small"
            />

        </div>
    );
};

export default MostPopular;