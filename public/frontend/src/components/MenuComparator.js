import React, {useState, useEffect} from 'react';
import {Table, Progress, Typography} from 'antd';
import axios from 'axios';
import './MenuComparator.css';

const { Title } = Typography;

const MenuComparator = ({apiRootUrl, itemIds, searchQuery}) => {
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchMenuItems = async () => {
            setLoading(true);
            try {
                // Fetch menu details
                const menuResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {item_id: itemIds.join(',')},
                });

                let updatedMenuItems = menuResponse.data;

                // If searchQuery is provided, perform a search and update scores
                if (searchQuery) {
                    const searchResponse = await axios.get(`${apiRootUrl}/search`, {
                        params: {search: searchQuery, limit: 200},
                    });

                    // Create a map of item_id to score
                    const scoreMap = new Map(searchResponse.data.map(item => [item.id, item.score]));

                    // Update menuItems with scores
                    updatedMenuItems = updatedMenuItems.map(menu => ({
                        ...menu,
                        score: scoreMap.get(menu.item_id) || 0,
                    }));
                }
                setMenuItems(updatedMenuItems);
            } catch (error) {
                console.error('Error fetching menu items:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMenuItems();
    }, [apiRootUrl, itemIds, searchQuery]);

    const columns = [
        {
            title: 'Attribute',
            dataIndex: 'attribute',
            key: 'attribute',
            width: 100,
            fixed: 'left'
        },
        ...menuItems.map((item) => ({
            title: `${item.name}`,
            dataIndex: item.item_id,
            key: item.item_id,
            width: 200,
        })),
    ];

    const dataSource = [
        {
            attribute: 'Score',
            ...menuItems.reduce((acc, item) => ({
                ...acc,
                [item.item_id]: (
                    item.score ?
                    <Progress
                        percent={Number((item.score * 100).toFixed(2))}
                        status="active"
                        strokeColor={{
                            '0%': '#108ee9',
                            '100%': '#87d068',
                        }}
                        format={(percent) => `${percent}%`}
                        size={[250, 25]}
                        percentPosition={{ align: 'center', type: 'inner' }}
                    />
                        :
                        ""
                ),
            }), {}),
        },
        {attribute: 'ID', ...menuItems.reduce((acc, item) => ({...acc, [item.item_id]: item.item_id}), {})},
        {
            attribute: 'Type', ...menuItems.reduce((acc, item) => ({
                ...acc,
                [item.item_id]: item.content_classification
            }), {})
        },
        {attribute: 'Main Ingredient', ...menuItems.reduce((acc, item) => ({...acc, [item.item_id]: item.genres}), {})},
        {attribute: 'Secondary', ...menuItems.reduce((acc, item) => ({...acc, [item.item_id]: item.genre_l2}), {})},
        {
            attribute: 'Tertiary', ...menuItems.reduce((acc, item) => ({
                ...acc,
                [item.item_id]: item.genre_l3
            }), {})
        },
        {
            attribute: 'Other Ingredients:', ...menuItems.reduce((acc, item) => ({
                ...acc,
                [item.item_id]: item.product_description
            }), {})
        },

    ];

    return (
        <div className="menu-comparator-wrapper">
            {searchQuery && (
                <Title level={4} style={{marginBottom: 16}}>
                    Comparaison against: <b><font color="#00a">{searchQuery}</font></b>
                </Title>
            )}
            <Table
                loading={loading}
                className="menu-comparator-table"
                columns={columns}
                dataSource={dataSource}
                pagination={false}
                scroll={{ x: 'max-content' }}
            />

        </div>
    );
};

export default MenuComparator;