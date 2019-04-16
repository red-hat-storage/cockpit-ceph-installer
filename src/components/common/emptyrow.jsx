import React from 'react';
import '../../app.scss';

export const emptyRow = () => {
    return (
        <tr colSpan="10" className="emptyRow">
            <td colSpan="10" className="emptyCell">No Hosts Defined</td>
        </tr>
    );
};
