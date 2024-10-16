import React, {useState, useEffect} from 'react';
import {Table, Checkbox} from 'antd';
import axios from 'axios';

const TopPicks = ({apiRootUrl, userId, onCheckMenu, checkedItemIds}) => {
    const [topPicks, setTopPicks] = useState([]);
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
        const fetchTopPicks = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                // First API call to get the list of top picks
                const topPicksResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {
                        type: 'picks',
                        user_id: userId,
                    },
                });

                // Extract all item IDs from the top picks
                const itemIds = topPicksResponse.data.map(item => item.itemId);

                // Single API call to get menu details for all items
                const menuResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {item_id: itemIds.join(',')},
                });

                // Create a map of item_id to menu details for quick lookup
                const menuMap = menuResponse.data.reduce((acc, menu) => {
                    acc[menu.item_id] = menu;
                    return acc;
                }, {});

                // Combine top picks data with menu details
                const detailedTopPicks = topPicksResponse.data.map((item, index) => {
                    const menu = menuMap[item.itemId] || {};
                    return {
                        number: index + 1,
                        itemId: item.itemId,
                        menuName: menu.name || 'N/A'
                    };
                });

                setTopPicks(detailedTopPicks);
            } catch (error) {
                console.error('Error fetching top picks:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTopPicks();
    }, [apiRootUrl, userId]);

    return (
        <div style={{margin:10}}>
            <h2>Top Picks</h2>

            <Table loading={loading} columns={columns} dataSource={topPicks} rowKey="itemId" size="small"
            />

        </div>
    );
};

export default TopPicks;