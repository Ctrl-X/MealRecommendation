import React, {useState} from 'react';
import {Input} from 'antd';

const {Search} = Input;

const SearchBar = ({onSearch}) => {
    const [value, setValue] = useState('');

    const handleSearch = () => {
        onSearch(value);
    };

    return (
        <div style={{margin: 10}}>

            <Search
                placeholder="Search menus"
                enterButton="Search"
                size="large"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onSearch={handleSearch}
            />
        </div>
    );
};

export default SearchBar;