import React, { useState } from 'react';
import { Checkbox, Button, Space, Spin, Typography } from 'antd';

const { Text } = Typography;

const IngredientList = ({ loading, ingredients, selectedIngredients, onSelectIngredient, title }) => {
    const [showAll, setShowAll] = useState(false);
    const displayLimit = 50;

    const handleCheckAll = () => {
        const allIngredientIds = ingredients.map(ingredient => ingredient.name);
        allIngredientIds.forEach(id => onSelectIngredient(id, true));
    };

    const handleUncheckAll = () => {
        ingredients.forEach(ingredient => onSelectIngredient(ingredient.name, false));
    };

    const toggleShowAll = () => {
        setShowAll(!showAll);
    };

    const displayedIngredients = showAll ? ingredients : ingredients.slice(0, displayLimit);
    const remainingCount = ingredients.length - displayLimit;

    return (
        <div>
            <h2>{title}</h2>
            <Space style={{ marginBottom: 16 }}>
                <Button onClick={handleCheckAll}>Check All</Button>
                <Button onClick={handleUncheckAll}>Uncheck All</Button>
            </Space>
            {loading ? (
                <Spin />
            ) : (
                <div style={{ border:"1px solid gray",display: 'flex', flexDirection: 'rows', gap: '8px', flexWrap:"wrap",maxHeight:150,overflow:"scroll" }}>
                    {displayedIngredients.map(ingredient => (
                        <Checkbox
                            style={{width:200,textAlign:"center",verticalAlign:"middle"}}
                            key={ingredient.name}
                            checked={selectedIngredients.includes(ingredient.name)}
                            onChange={(e) => onSelectIngredient(ingredient.name, e.target.checked)}
                        >
                            {`${ingredient.name} (${ingredient.count || 0})`}
                        </Checkbox>
                    ))}
                    {!showAll && remainingCount > 0 && (
                        <Button type="link" onClick={toggleShowAll}>
                            + {remainingCount} more ingredients
                        </Button>
                    )}
                    {showAll && (
                        <Button type="link" onClick={toggleShowAll}>
                            Show less
                        </Button>
                    )}
                </div>
            )}
            <Text type="secondary">
                Total ingredients: {ingredients.length}, Selected: {selectedIngredients.length}
            </Text>
        </div>
    );
};

export default IngredientList;