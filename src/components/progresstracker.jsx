import React from 'react';
import '../app.scss';

export class ProgressTracker extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
        this.itemState = Array(7).fill("indicator");
    }

    render() {
        if (this.props.pageNum >= 1) {
            for (let i = 1; i < 7; i++) {
                if (i == this.props.pageNum) {
                    this.itemState[i] = "indicator selected";
                } else {
                    // let current = this.itemState[i];
                    // current = current.replace('selected', '');
                    this.itemState[i] = "indicator";
                }
            }
        }

        return (
            <div id="navcontainer">
                <span label-name="Environment" className={this.itemState[1]}>1</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Hosts" className={this.itemState[2]}>2</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Validate" className={this.itemState[3]}>3</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Network" className={this.itemState[4]}>4</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Review" className={this.itemState[5]}>5</span>
                <span className="joiner">&nbsp;</span>
                <span label-name="Deploy" className={this.itemState[6]}>6</span>
            </div>
            // <div id="navcontainer">
            //     <span label-name="Environment" onClick={ () => this.props.pageSwitcher(1) } className={this.itemState[1]}>1</span>
            //     <span className="joiner">&nbsp;</span>
            //     <span label-name="Hosts" onClick={() => this.props.pageSwitcher(2)} className={this.itemState[2]}>2</span>
            //     <span className="joiner">&nbsp;</span>
            //     <span label-name="Validate" onClick={() => this.props.pageSwitcher(3)} className={this.itemState[3]}>3</span>
            //     <span className="joiner">&nbsp;</span>
            //     <span label-name="Network" onClick={() => this.props.pageSwitcher(4)} className={this.itemState[4]}>4</span>
            //     <span className="joiner">&nbsp;</span>
            //     <span label-name="Review" onClick={() => this.props.pageSwitcher(5)} className={this.itemState[5]}>5</span>
            //     <span className="joiner">&nbsp;</span>
            //     <span label-name="Deploy" onClick={() => this.props.pageSwitcher(6)} className={this.itemState[6]}>6</span>
            // </div>
        );
    }
}

export default ProgressTracker;
