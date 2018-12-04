import React from 'react';
import '../../app.scss';

export class ElapsedTime extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            timer: 0
        };
        this.loadInterval = 0;
    }

    updateTimer = () => {
        let currentTime = this.state.timer;
        this.setState({timer: currentTime + 1});
    }

    componentDidMount(props) {
        this.loadInterval = setInterval(this.updateTimer, 1000);
    }

    componentWillUnmount(props) {
        console.log("Unmounting the ElapsedTime component, cancelling the timer");
        clearInterval(this.loadInterval);
    }

    render() {
        let date = new Date(null);
        date.setSeconds(this.state.timer);
        let timeStr = date.toISOString().substr(11, 8);

        return (
            <span>{timeStr}</span>
        );
    }
}
